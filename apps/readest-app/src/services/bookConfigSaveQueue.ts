import { ReaderCloseGuard, readerCloseGuard } from './translators/readerCloseGuard';

interface PendingSave {
  action: () => Promise<void>;
}
interface Entry {
  pending: PendingSave | null;
  running: Promise<void> | null;
  unregister: () => void;
}

/** Window-local dirty snapshots. No timers, networking or module-time hydration. */
export class BookConfigSaveQueue {
  private entries = new Map<string, Entry>();

  constructor(
    private guard: ReaderCloseGuard = readerCloseGuard,
    private notify: (bookKey: string, error: string | null) => void = () => {},
  ) {}

  save(bookKey: string, action: () => Promise<void>): Promise<void> {
    let entry = this.entries.get(bookKey);
    if (!entry) {
      entry = { pending: null, running: null, unregister: () => {} };
      this.entries.set(bookKey, entry);
      entry.unregister = this.guard.register(bookKey, {
        // Config writes are finite: flush awaits them instead of treating them
        // as an ongoing translation task which the owner must stop manually.
        isBusy: () => false,
        hasPending: () =>
          !!this.entries.get(bookKey)?.pending || !!this.entries.get(bookKey)?.running,
        flush: () => this.retry(bookKey),
      });
    }
    const owner = entry;
    owner.pending = { action };
    if (owner.running) return owner.running;
    const run = Promise.resolve().then(async () => {
      // At most one in-flight snapshot and the newest pending snapshot.
      // All callers join the same drain; a burst cannot retain a promise chain
      // with one full book configuration per keystroke.
      do {
        while (owner.pending) {
          const pending = owner.pending;
          try {
            await pending.action();
            if (owner.pending === pending) {
              owner.pending = null;
            }
          } catch (error) {
            if (owner.pending !== pending) continue;
            this.notify(bookKey, error instanceof Error ? error.message : String(error));
            throw error;
          }
        }
        this.notify(bookKey, null);
        // A synchronous observer can enqueue again while clearing an error.
        // That caller joined this drain too: do not resolve before its write.
      } while (owner.pending);
    });
    owner.running = run;
    const finish = () => {
      owner.running = null;
      if (!owner.pending && this.entries.get(bookKey) === owner) {
        owner.unregister();
        this.entries.delete(bookKey);
      }
    };
    void run.then(finish, finish);
    return run;
  }

  async retry(bookKey: string): Promise<void> {
    const entry = this.entries.get(bookKey);
    if (!entry) return;
    await entry.running?.catch(() => {});
    const latest = this.entries.get(bookKey)?.pending;
    if (latest) await this.save(bookKey, latest.action);
  }
}
