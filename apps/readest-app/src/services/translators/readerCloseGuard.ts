interface ReaderSaveState {
  isBusy(): boolean;
  hasPending(): boolean;
  flush(): Promise<void>;
}

/** Window-local lifecycle gate. No requests are issued while retrying saves. */
export class ReaderCloseGuard {
  private readers = new Map<string, ReaderSaveState>();

  register(bookKey: string, state: ReaderSaveState): () => void {
    this.readers.set(bookKey, state);
    return () => {
      if (this.readers.get(bookKey) === state) this.readers.delete(bookKey);
    };
  }

  needsProtection(bookKeys: string[]): boolean {
    return bookKeys.some((key) => {
      const state = this.readers.get(key);
      return state && (state.isBusy() || state.hasPending());
    });
  }

  async prepare(bookKeys: string[]): Promise<void> {
    const states = bookKeys.flatMap((key) => {
      const state = this.readers.get(key);
      return state ? [state] : [];
    });
    if (states.some((state) => state.isBusy())) throw new Error('Translation is still running');
    await Promise.all(states.map((state) => state.flush()));
    if (states.some((state) => state.isBusy() || state.hasPending()))
      throw new Error('Translation results are not saved');
  }
}

export const readerCloseGuard = new ReaderCloseGuard();
