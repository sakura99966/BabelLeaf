class TtsSessionPresence extends EventTarget {
  #active = false;

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
