import { getTranslationArtifactPath, type TranslationArtifact } from './artifacts';

type Writer = { save(artifact: TranslationArtifact): Promise<void> };

/** Retains results in the open reader until a local-only save succeeds. */
export class PendingArtifactWrites {
  private writerIds = new WeakMap<Writer, number>();
  private nextWriterId = 0;
  private pending = new Map<string, { writer: Writer; artifact: TranslationArtifact }>();
  hasUnsaved = false;

  get hasPending(): boolean {
    return this.pending.size > 0;
  }

  constructor(private changed: (unsaved: boolean) => void) {}

  async save(writer: Writer, artifact: TranslationArtifact): Promise<void> {
    if (!this.writerIds.has(writer)) this.writerIds.set(writer, ++this.nextWriterId);
    const key = `${this.writerIds.get(writer)}:${getTranslationArtifactPath(artifact)}`;
    const previous = this.pending.get(key)?.artifact;
    const segments = new Map(previous?.segments.map((segment) => [segment.id, segment]));
    for (const segment of artifact.segments) {
      const old = segments.get(segment.id);
      if (!old || segment.updatedAt >= old.updatedAt) segments.set(segment.id, segment);
    }
    const entry = { writer, artifact: { ...artifact, segments: [...segments.values()] } };
    this.pending.set(key, entry);
    try {
      await writer.save(entry.artifact);
      if (this.pending.get(key) === entry) this.pending.delete(key);
      if (this.pending.size === 0) this.hasUnsaved = false;
    } catch (error) {
      // A newer successful write may already have committed this entry's
      // merged snapshot. A late failure must not poison an empty retry queue.
      this.hasUnsaved = this.pending.size > 0;
      throw error;
    } finally {
      this.changed(this.hasUnsaved);
    }
  }

  async retry(): Promise<void> {
    for (const { writer, artifact } of [...this.pending.values()])
      await this.save(writer, artifact);
  }
}
