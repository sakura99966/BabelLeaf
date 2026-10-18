import { useBookDataStore } from '@/store/bookDataStore';
import { useTranslation } from '@/hooks/useTranslation';

export function BookConfigSaveWarning({ bookKeys }: { bookKeys: string[] }) {
  const _ = useTranslation();
  const errors = useBookDataStore((state) => state.configSaveErrors);
  const retry = useBookDataStore((state) => state.retryConfigSave);
  const failed = bookKeys.filter((key) => errors[key]);
  if (!failed.length) return null;
  return (
    <div
      role='alert'
      className='absolute bottom-12 left-2 right-2 z-50 border border-base-content bg-base-100 p-3 text-base-content'
    >
      <p>{_('Book changes not saved. Keep this book open and retry saving.')}</p>
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
