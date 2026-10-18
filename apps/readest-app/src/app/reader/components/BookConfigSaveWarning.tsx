import { useBookDataStore } from '@/store/bookDataStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useBookConfigRecoveryStore } from '@/store/bookConfigRecoveryStore';

export function BookConfigSaveWarning({ bookKeys }: { bookKeys: string[] }) {
  const _ = useTranslation();
  const errors = useBookDataStore((state) => state.configSaveErrors);
  const retry = useBookDataStore((state) => state.retryConfigSave);
  const recoveryHashes = useBookConfigRecoveryStore((state) => state.recovered);
  const dismissRecovery = useBookConfigRecoveryStore((state) => state.dismiss);
  const failed = bookKeys.filter((key) => errors[key]);
  const recovered = [...new Set(bookKeys.map((key) => key.split('-')[0]!))].filter((hash) =>
    recoveryHashes.includes(hash),
  );
  if (!failed.length && !recovered.length) return null;
  return (
    <div
      role='alert'
      className='absolute bottom-12 left-2 right-2 z-50 border border-base-content bg-base-100 p-3 text-base-content'
    >
      {recovered.length > 0 && (
        <div>
          <p>
            {_('Book settings recovered from a local backup. Check annotations before continuing.')}
          </p>
          <button
            className='btn btn-outline btn-sm'
            onClick={() => recovered.forEach(dismissRecovery)}
          >
            {_('Dismiss')}
          </button>
        </div>
      )}
      {failed.length > 0 && (
        <p>{_('Book changes not saved. Keep this book open and retry saving.')}</p>
      )}
      {failed.map((key) => (
        <div key={key}>
          <p>{errors[key]}</p>
          <button
            className='btn btn-outline btn-sm'
            onClick={() => void retry(key).catch(() => {})}
          >
            {_('Retry')}
          </button>
        </div>
      ))}
    </div>
  );
}
