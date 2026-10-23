import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { ttsSessionPresence } from '@/services/tts/sessionPresence';

/** Preserve annotations/metadata, but do not retain closed parser workers/files. */
export async function releaseClosedBookContent(bookKey: string): Promise<boolean> {
  const hash = bookKey.split('-')[0]!;
  const hasView = () =>
    Object.keys(useReaderStore.getState().viewStates).some((key) => key.split('-')[0] === hash);
  if (hasView() || ttsSessionPresence.hasBookOwner(hash)) return false;
  // Reconcile same-turn reopens/new speech claims without importing an engine.
  await Promise.resolve();
  if (hasView() || ttsSessionPresence.hasBookOwner(hash)) return false;
  await useBookDataStore.getState().releaseBookContent(hash);
  return true;
}
