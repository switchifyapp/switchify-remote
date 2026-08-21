import type { RemoteSession } from './RemoteSession';

export class LiveTypingController {
  #applied = '';
  #desired = '';
  #queue: Promise<boolean> = Promise.resolve(true);

  constructor(private readonly session: Pick<RemoteSession, 'streamChunk' | 'streamKey'>) {}

  update(next: string): Promise<boolean> {
    this.#desired = next;
    const result = this.#queue.catch(() => false).then(() => this.#reconcile());
    this.#queue = result;
    return result;
  }

  submitLine(): Promise<boolean> {
    const result = this.#queue.catch(() => false).then(async () => {
      if (!await this.#reconcile()) return false;
      if (!await this.session.streamKey('Enter')) return false;
      this.#applied = '';
      this.#desired = '';
      return true;
    });
    this.#queue = result;
    return result;
  }

  applied(): string { return this.#applied; }

  async #reconcile(): Promise<boolean> {
    while (this.#applied !== this.#desired) {
      const current = Array.from(this.#applied);
      const desired = Array.from(this.#desired);
      let prefix = 0;
      while (prefix < current.length && prefix < desired.length && current[prefix] === desired[prefix]) prefix += 1;
      for (let count = current.length; count > prefix; count -= 1) {
        if (!await this.session.streamKey('Backspace')) return false;
        this.#applied = Array.from(this.#applied).slice(0, -1).join('');
      }
      const inserted = desired.slice(prefix).join('');
      if (inserted) {
        if (!await this.session.streamChunk(inserted)) return false;
        this.#applied = desired.join('');
      }
    }
    return true;
  }
}
