import type { BookNote } from '@/types/book';

/** Merge full snapshots without reviving tombstones or dropping other views. */
export function mergeBooknoteSnapshots(
  previous: BookNote[] = [],
  incoming: BookNote[] = [],
): BookNote[] {
  const group = (note: BookNote) => JSON.stringify([note.id, note.type]);
  const identity = (note: BookNote) => JSON.stringify([note.id, note.type, note.cfi]);
  const time = (note: BookNote) =>
    Math.max(note.updatedAt ?? note.createdAt ?? 0, note.deletedAt ?? 0);
  const notes = new Map<string, BookNote>();
  const previousGroups = new Map<string, BookNote[]>();
  const incomingCounts = new Map<string, number>();
  for (const note of previous) {
    const entries = previousGroups.get(group(note)) ?? [];
    entries.push(note);
    previousGroups.set(group(note), entries);
    notes.set(identity(note), note);
  }
  for (const note of incoming)
    incomingCounts.set(group(note), (incomingCounts.get(group(note)) ?? 0) + 1);
  for (const note of incoming) {
    const oldGroup = previousGroups.get(group(note)) ?? [];
    if (oldGroup.length === 1 && incomingCounts.get(group(note)) === 1) {
      const old = oldGroup[0]!;
      if (identity(old) !== identity(note)) {
        if (time(old) > time(note)) continue;
        notes.delete(identity(old));
      }
    }
    const old = notes.get(identity(note));
    if (!old || time(note) >= time(old)) notes.set(identity(note), { ...old, ...note });
  }
  return [...notes.values()];
}
