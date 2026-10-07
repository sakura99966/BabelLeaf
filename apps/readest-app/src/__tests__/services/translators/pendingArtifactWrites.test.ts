import { expect, test, vi } from 'vitest';
import { PendingArtifactWrites } from '@/services/translators/pendingArtifactWrites';
import { createTranslationArtifact } from '@/services/translators/artifacts';

test('does not leave a false dirty flag when an older write fails after a newer save succeeds', async () => {
  let rejectFirst!: (error: Error) => void;
  const first = new Promise<void>((_resolve, reject) => {
    rejectFirst = reject;
  });
  const writer = { save: vi.fn().mockReturnValueOnce(first).mockResolvedValue(undefined) };
  const pending = new PendingArtifactWrites(() => {});
  const artifact = createTranslationArtifact({
    bookHash: 'book',
    provider: 'deepseek',
    sourceLang: 'en',
    targetLang: 'zh',
    promptVersion: 'v1',
  });
  const older = pending.save(writer, artifact);
  const failure = expect(older).rejects.toThrow('late failure');
  await pending.save(writer, artifact);
  rejectFirst(new Error('late failure'));
  await failure;
  expect(pending.hasPending).toBe(false);
  expect(pending.hasUnsaved).toBe(false);
  await pending.retry();
  expect(pending.hasUnsaved).toBe(false);
});

test('keeps failed writes isolated when storage changes for the same book', async () => {
  const first = {
    save: vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined),
  };
  const second = {
    save: vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined),
  };
  const pending = new PendingArtifactWrites(() => {});
  const artifact = createTranslationArtifact({
    bookHash: 'book',
    provider: 'deepseek',
    sourceLang: 'en',
    targetLang: 'zh',
    promptVersion: 'v1',
  });
  await pending.save(first, artifact).catch(() => {});
  await pending.save(second, artifact).catch(() => {});
  await pending.retry();
  expect(first.save).toHaveBeenCalledTimes(2);
  expect(second.save).toHaveBeenCalledTimes(2);
});

test('retains failed local saves and retries without issuing a translation request', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
  const changed = vi.fn();
  const pending = new PendingArtifactWrites(changed);
  const artifact = createTranslationArtifact({
    bookHash: 'book',
    provider: 'deepseek',
    sourceLang: 'en',
    targetLang: 'zh',
    promptVersion: 'v1',
  });
  await expect(pending.save({ save }, artifact)).rejects.toThrow('disk full');
  expect(pending.hasUnsaved).toBe(true);
  await pending.retry();
  expect(pending.hasUnsaved).toBe(false);
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith(artifact);
});
