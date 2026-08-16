import type { ConnectionManager } from '@/connection/ConnectionManager';
import { commandPayloads } from '@/domain/protocol/commands';
import type { JsonObject, PointerProfile } from '@/domain/protocol/types';

export type RemoteSessionState = { repeat: string | null; dragging: boolean; modifiers: string[]; streamOpen: boolean };

export class RemoteSession {
  #state: RemoteSessionState = { repeat: null, dragging: false, modifiers: [], streamOpen: false };
  #listeners = new Set<() => void>();
  #streamId: string | null = null;
  #sequence = 0;

  constructor(private readonly manager: ConnectionManager, readonly profile: PointerProfile | null, private readonly id = () => `${Date.now()}-${Math.random()}`, readonly connectionIdentity: string | null = null) {}
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  snapshot = () => this.#state;

  async mouse(type: string, payload: JsonObject = {}, repeatable = false): Promise<boolean> {
    if (this.#state.repeat) { await this.stopRepeat(); return true; }
    if (repeatable && this.profile?.capabilities.mouseRepeat.supported && this.profile.capabilities.mouseRepeat.enabled) {
      const [repeatType, repeatPayload] = commandPayloads.repeatStart({ type: type as 'mouse.move' | 'mouse.scroll', dx: Number(payload.dx), dy: Number(payload.dy) });
      const ok = await this.manager.send(repeatType, repeatPayload);
      if (ok) this.#set({ repeat: type });
      return ok;
    }
    return this.manager.send(type, payload, this.#supportsNoAck(type) ? 'none' : 'ack');
  }

  async stopRepeat(): Promise<void> {
    if (!this.#state.repeat) return;
    const [type, payload] = commandPayloads.repeatStop();
    await this.manager.send(type, payload, 'none');
    this.#set({ repeat: null });
  }

  async toggleDrag(): Promise<boolean> {
    await this.stopRepeat();
    const [type, payload] = this.#state.dragging ? commandPayloads.dragEnd() : commandPayloads.dragStart();
    const ok = await this.manager.send(type, payload);
    if (ok) this.#set({ dragging: !this.#state.dragging });
    return ok;
  }

  async toggleModifier(key: string): Promise<boolean> {
    const active = this.#state.modifiers.includes(key);
    const [type, payload] = active ? commandPayloads.modifierUp(key) : commandPayloads.modifierDown(key);
    const ok = await this.manager.send(type, payload, this.#supportsNoAck(type) ? 'none' : 'ack');
    if (ok) this.#set({ modifiers: active ? this.#state.modifiers.filter((item) => item !== key) : [...this.#state.modifiers, key] });
    return ok;
  }

  async command(type: string, payload: JsonObject = {}): Promise<boolean> {
    await this.stopRepeat();
    const ok = await this.manager.send(type, payload, this.#supportsNoAck(type) ? 'none' : 'ack');
    if (ok && this.#state.dragging && (type === 'mouse.click' || type === 'mouse.doubleClick' || type === 'mouse.rightClick')) this.#set({ dragging: false });
    return ok;
  }

  async openStream(): Promise<boolean> {
    if (this.#state.streamOpen) return true;
    const streamId = this.id();
    const [type, payload] = commandPayloads.streamOpen(streamId);
    const ok = await this.command(type, payload);
    if (ok) { this.#streamId = streamId; this.#sequence = 0; this.#set({ streamOpen: true }); }
    return ok;
  }

  async streamChunk(text: string): Promise<boolean> {
    if (!text || !await this.openStream()) return false;
    const [type, payload] = commandPayloads.streamChunk(this.#streamId!, this.#sequence, text);
    const ok = await this.manager.send(type, payload, this.#supportsNoAck(type) ? 'none' : 'ack');
    if (ok) this.#sequence += 1;
    return ok;
  }

  async streamKey(key: string): Promise<boolean> {
    if (!await this.openStream()) return false;
    const [type, payload] = commandPayloads.streamKey(this.#streamId!, this.#sequence, key);
    const ok = await this.manager.send(type, payload);
    if (ok) this.#sequence += 1;
    return ok;
  }

  async closeStream(): Promise<void> {
    if (!this.#state.streamOpen || !this.#streamId) return;
    const [type, payload] = commandPayloads.streamClose(this.#streamId, this.#sequence);
    this.#set({ streamOpen: false });
    this.#streamId = null;
    await this.manager.send(type, payload, 'none');
  }

  async cleanup(): Promise<void> {
    await this.stopRepeat();
    if (this.#state.dragging) { const [type, payload] = commandPayloads.dragEnd(); await this.manager.send(type, payload, 'none'); }
    for (const key of this.#state.modifiers) { const [type, payload] = commandPayloads.modifierUp(key); await this.manager.send(type, payload, 'none'); }
    await this.closeStream();
    this.#state = { repeat: null, dragging: false, modifiers: [], streamOpen: false };
    this.#emit();
  }

  #supportsNoAck(type: string): boolean { return this.profile?.capabilities.noAckCommands.includes(type) === true || (type === 'mouse.move' && this.profile?.capabilities.noAckMouseMove === true); }
  #set(patch: Partial<RemoteSessionState>): void { this.#state = { ...this.#state, ...patch }; this.#emit(); }
  #emit(): void { this.#listeners.forEach((listener) => listener()); }
}
