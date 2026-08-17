import type { ConnectionManager } from '@/connection/ConnectionManager';
import { switchifyBridge } from '@/bridge/SwitchifyBridgeClient';
import type { SwitchifyBridge } from '@/bridge/types';
import { commandPayloads } from '@/domain/protocol/commands';
import type { JsonObject, PointerProfile } from '@/domain/protocol/types';

export type RemoteSessionState = { repeat: string | null; dragging: boolean; modifiers: string[]; streamOpen: boolean };

export class RemoteSession {
  #state: RemoteSessionState = { repeat: null, dragging: false, modifiers: [], streamOpen: false };
  #listeners = new Set<() => void>();
  #streamId: string | null = null;
  #sequence = 0;
  #streamQueue: Promise<void> = Promise.resolve();
  #repeatQueue: Promise<void> = Promise.resolve();
  #repeatGeneration = 0;
  #repeatArmAttempt = 0;
  #repeatBridgeArmed = false;
  #bridgeUnsubscribe: () => void;

  constructor(
    private readonly manager: ConnectionManager,
    readonly profile: PointerProfile | null,
    private readonly id = () => `${Date.now()}-${Math.random()}`,
    readonly connectionIdentity: string | null = null,
    private readonly bridge: SwitchifyBridge = switchifyBridge,
    private readonly bridgeTimeoutMs = 1_000,
  ) {
    this.#bridgeUnsubscribe = bridge.subscribe((event) => {
      if (event.type === 'repeatStop' && event.generation === this.#repeatGeneration && this.#state.repeat) void this.stopRepeat('ack');
      if (event.type === 'snapshot') {
        const available = event.captureAvailable && event.externalSwitches.length > 0;
        if (!available) {
          const generation = this.#repeatGeneration;
          this.#repeatArmAttempt += 1;
          this.#repeatBridgeArmed = false;
          this.#repeatGeneration = 0;
          if (generation > 0) void this.bridge.setRepeatActive(generation, false);
        } else if (this.#state.repeat && !this.#repeatBridgeArmed && this.#repeatGeneration === 0) void this.#armRepeatBridge();
      }
    });
  }
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  snapshot = () => this.#state;

  mouse(type: string, payload: JsonObject = {}, repeatable = false): Promise<boolean> {
    return this.#enqueueRepeat(() => this.#mouse(type, payload, repeatable));
  }

  async #mouse(type: string, payload: JsonObject, repeatable: boolean): Promise<boolean> {
    if (!this.supports(type)) return false;
    if (this.#state.repeat) { await this.#stopRepeat(); return true; }
    if (repeatable && this.supports('mouse.repeat.start') && this.supports('mouse.repeat.stop') && this.profile?.capabilities.mouseRepeat.supported && this.profile.capabilities.mouseRepeat.enabled) {
      const [repeatType, repeatPayload] = commandPayloads.repeatStart({ type: type as 'mouse.move' | 'mouse.scroll', dx: Number(payload.dx), dy: Number(payload.dy) });
      const ok = await this.manager.send(repeatType, repeatPayload);
      if (ok) {
        this.#set({ repeat: type });
        await this.#armRepeatBridge();
      }
      return ok;
    }
    return this.manager.send(type, payload, this.#supportsNoAck(type) ? 'none' : 'ack');
  }

  stopRepeat(responseMode: 'ack' | 'none' = 'none'): Promise<void> {
    return this.#enqueueRepeat(() => this.#stopRepeat(responseMode));
  }

  async #stopRepeat(responseMode: 'ack' | 'none' = 'none'): Promise<void> {
    if (!this.#state.repeat) return;
    const generation = this.#repeatGeneration;
    this.#repeatArmAttempt += 1;
    this.#repeatGeneration = 0;
    this.#repeatBridgeArmed = false;
    this.#set({ repeat: null });
    if (generation > 0) await this.#setRepeatActiveBounded(generation, false);
    const [type, payload] = commandPayloads.repeatStop();
    await this.manager.send(type, payload, responseMode);
  }

  async #armRepeatBridge(): Promise<void> {
    if (!this.#state.repeat || this.#repeatBridgeArmed || this.#repeatGeneration !== 0) return;
    const attempt = ++this.#repeatArmAttempt;
    const generation = this.bridge.nextGeneration();
    this.#repeatGeneration = generation;
    const accepted = await this.#setRepeatActiveBounded(generation, true);
    if (attempt !== this.#repeatArmAttempt || !this.#state.repeat) {
      if (accepted) await this.#setRepeatActiveBounded(generation, false);
      return;
    }
    this.#repeatBridgeArmed = accepted;
    if (!accepted && this.#repeatGeneration === generation) this.#repeatGeneration = 0;
  }

  async toggleDrag(): Promise<boolean> {
    await this.stopRepeat();
    const [type, payload] = this.#state.dragging ? commandPayloads.dragEnd() : commandPayloads.dragStart();
    if (!this.supports(type)) return false;
    const ok = await this.manager.send(type, payload);
    if (ok) this.#set({ dragging: !this.#state.dragging });
    return ok;
  }

  async toggleModifier(key: string): Promise<boolean> {
    const active = this.#state.modifiers.includes(key);
    const [type, payload] = active ? commandPayloads.modifierUp(key) : commandPayloads.modifierDown(key);
    if (!this.supports(type)) return false;
    const ok = await this.manager.send(type, payload, this.#supportsNoAck(type) ? 'none' : 'ack');
    if (ok) this.#set({ modifiers: active ? this.#state.modifiers.filter((item) => item !== key) : [...this.#state.modifiers, key] });
    return ok;
  }

  async command(type: string, payload: JsonObject = {}): Promise<boolean> {
    if (!this.supports(type)) return false;
    await this.stopRepeat();
    const ok = await this.manager.send(type, payload, this.#supportsNoAck(type) ? 'none' : 'ack');
    if (ok && this.#state.dragging && (type === 'mouse.click' || type === 'mouse.doubleClick' || type === 'mouse.rightClick')) this.#set({ dragging: false });
    return ok;
  }

  async openStream(): Promise<boolean> {
    return this.#enqueueStream(() => this.#openStream());
  }

  async streamChunk(text: string): Promise<boolean> {
    if (!text) return false;
    return this.#enqueueStream(async () => {
      if (!this.supports('keyboard.textStream.chunk') || !await this.#openStream()) return false;
      const [type, payload] = commandPayloads.streamChunk(this.#streamId!, this.#sequence, text);
      const ok = await this.manager.send(type, payload, this.#supportsNoAck(type) ? 'none' : 'ack');
      if (ok) this.#sequence += 1;
      return ok;
    });
  }

  async streamKey(key: string): Promise<boolean> {
    return this.#enqueueStream(async () => {
      if (!this.supports('keyboard.textStream.key') || !await this.#openStream()) return false;
      const [type, payload] = commandPayloads.streamKey(this.#streamId!, this.#sequence, key);
      const ok = await this.manager.send(type, payload);
      if (ok) this.#sequence += 1;
      return ok;
    });
  }

  async closeStream(): Promise<void> {
    await this.#enqueueStream(async () => {
      if (!this.#state.streamOpen || !this.#streamId) return;
      const [type, payload] = commandPayloads.streamClose(this.#streamId, this.#sequence);
      this.#set({ streamOpen: false });
      this.#streamId = null;
      await this.manager.send(type, payload, 'none');
    });
  }

  async shortcut(key: string): Promise<boolean> {
    if (!this.supports('keyboard.shortcut')) return false;
    const active = [...this.#state.modifiers];
    const [type, payload] = commandPayloads.shortcut([...active, key]);
    const ok = await this.command(type, payload);
    if (!ok) return false;
    for (const modifier of active) {
      const [releaseType, releasePayload] = commandPayloads.modifierUp(modifier);
      if (this.supports(releaseType)) await this.manager.send(releaseType, releasePayload, this.#supportsNoAck(releaseType) ? 'none' : 'ack');
    }
    if (active.length) this.#set({ modifiers: [] });
    return true;
  }

  supports(type: string): boolean { return this.profile?.capabilities.supportedCommands.includes(type) === true; }
  supportsAll(...types: string[]): boolean { return types.every((type) => this.supports(type)); }

  async #openStream(): Promise<boolean> {
    if (this.#state.streamOpen) return true;
    if (!this.supports('keyboard.textStream.open') || !this.supports('keyboard.textStream.close')) return false;
    const streamId = this.id();
    const [type, payload] = commandPayloads.streamOpen(streamId);
    const ok = await this.command(type, payload);
    if (ok) { this.#streamId = streamId; this.#sequence = 0; this.#set({ streamOpen: true }); }
    return ok;
  }

  #enqueueStream<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#streamQueue.catch(() => undefined).then(operation);
    this.#streamQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  #enqueueRepeat<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#repeatQueue.catch(() => undefined).then(operation);
    this.#repeatQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async #setRepeatActiveBounded(generation: number, active: boolean): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = this.bridge.setRepeatActive(generation, active).catch(() => false);
    const result = await Promise.race<boolean | null>([
      update,
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), this.bridgeTimeoutMs); }),
    ]);
    if (timer) clearTimeout(timer);
    if (result !== null) return result;
    if (active) {
      void update.then((accepted) => {
        if (accepted) void this.#setRepeatActiveBounded(generation, false);
      });
    }
    return false;
  }

  async cleanup(): Promise<void> {
    await this.stopRepeat();
    if (this.#state.dragging) { const [type, payload] = commandPayloads.dragEnd(); await this.manager.send(type, payload, 'none'); }
    for (const key of this.#state.modifiers) { const [type, payload] = commandPayloads.modifierUp(key); await this.manager.send(type, payload, 'none'); }
    await this.closeStream();
    this.#state = { repeat: null, dragging: false, modifiers: [], streamOpen: false };
    this.#emit();
  }

  dispose(): void {
    this.#bridgeUnsubscribe();
  }

  #supportsNoAck(type: string): boolean { return this.profile?.capabilities.noAckCommands.includes(type) === true || (type === 'mouse.move' && this.profile?.capabilities.noAckMouseMove === true); }
  #set(patch: Partial<RemoteSessionState>): void { this.#state = { ...this.#state, ...patch }; this.#emit(); }
  #emit(): void { this.#listeners.forEach((listener) => listener()); }
}
