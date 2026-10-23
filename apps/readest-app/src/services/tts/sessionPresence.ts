class TtsSessionPresence extends EventTarget {
  #active = false;
  #bookOwners = new Map<string, number>();

  hasBookOwner(hash: string): boolean {
    return (this.#bookOwners.get(hash) ?? 0) > 0;
  }

  retainBook(hash: string): () => void {
    this.#bookOwners.set(hash, (this.#bookOwners.get(hash) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = (this.#bookOwners.get(hash) ?? 1) - 1;
      if (remaining) this.#bookOwners.set(hash, remaining);
      else this.#bookOwners.delete(hash);
    };
  }

  isActive(): boolean {
    return this.#active;
  }

  setActive(active: boolean): void {
    if (this.#active === active) return;
    this.#active = active;
    this.dispatchEvent(new Event('change'));
  }
}

export const ttsSessionPresence = new TtsSessionPresence();
