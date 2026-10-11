interface ReaderSaveState {
  isBusy(): boolean;
  hasPending(): boolean;
  flush(): Promise<void>;
}

/** Window-local lifecycle gate. No requests are issued while retrying saves. */
export class ReaderCloseGuard {
  private readers = new Map<string, Set<ReaderSaveState>>();

  register(bookKey: string, state: ReaderSaveState): () => void {
    const owners = this.readers.get(bookKey) ?? new Set<ReaderSaveState>();
    owners.add(state);
    this.readers.set(bookKey, owners);
    return () => {
      owners.delete(state);
      if (owners.size === 0 && this.readers.get(bookKey) === owners) this.readers.delete(bookKey);
    };
  }

  needsProtection(bookKeys: string[]): boolean {
    return bookKeys.some((key) => {
      return [...(this.readers.get(key) ?? [])].some(
        (state) => state.isBusy() || state.hasPending(),
      );
    });
  }

  async prepare(bookKeys: string[]): Promise<void> {
    const states = [...new Set(bookKeys.flatMap((key) => [...(this.readers.get(key) ?? [])]))];
    if (states.some((state) => state.isBusy())) throw new Error('Translation is still running');
    await Promise.all(states.map((state) => state.flush()));
    if (states.some((state) => state.isBusy() || state.hasPending()))
      throw new Error('Translation results are not saved');
  }
}

export const readerCloseGuard = new ReaderCloseGuard();
