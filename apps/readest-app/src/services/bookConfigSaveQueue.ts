import { ReaderCloseGuard, readerCloseGuard } from './translators/readerCloseGuard';

interface PendingSave {
  action: () => Promise<void>;
}
interface Entry {
  pending: PendingSave | null;
  running: Promise<void>;
  count: number;
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
      entry = { pending: null, running: Promise.resolve(), count: 0, unregister: () => {} };
      this.entries.set(bookKey, entry);
      entry.unregister = this.guard.register(bookKey, {
        // Config writes are finite: flush awaits them instead of treating them
        // as an ongoing translation task which the owner must stop manually.
        isBusy: () => false,
        hasPending: () =>
          !!this.entries.get(bookKey)?.pending || !!this.entries.get(bookKey)?.count,
        flush: () => this.retry(bookKey),
      });
    }
    const owner = entry;
    const pending = { action };
    owner.pending = pending;
    owner.count++;
    const run = owner.running
      .catch(() => {})
      .then(async () => {
        try {
          await action();
          if (owner.pending === pending) {
            owner.pending = null;
            this.notify(bookKey, null);
          }
        } catch (error) {
          if (owner.pending === pending)
            this.notify(bookKey, error instanceof Error ? error.message : String(error));
          throw error;
        }
      });
    owner.running = run;
    const finish = () => {
      owner.count--;
      if (!owner.pending && owner.count === 0 && this.entries.get(bookKey) === owner) {
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
    await entry.running.catch(() => {});
    const latest = this.entries.get(bookKey)?.pending;
    if (latest) await this.save(bookKey, latest.action);
  }
}
