import clsx from 'clsx';
import React, { useEffect, useState } from 'react';

import { Book } from '@/types/book';
import { getBookWithUpdatedMetadata } from '@/utils/book';
import { BookMetadata } from '@/libs/document';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useMetadataEdit } from './useMetadataEdit';
import { eventDispatcher } from '@/utils/event';
import { isWebAppPlatform } from '@/services/environment';
import DeleteConfirmAlert from '@/components/DeleteConfirmAlert';
import Dialog from '@/components/Dialog';
import BookDetailView from './BookDetailView';
import BookDetailEdit from './BookDetailEdit';
import Spinner from '../Spinner';

interface BookDetailModalProps {
  book: Book;
  isOpen: boolean;
  onClose: () => void;
  handleBookDelete?: (book: Book) => void;
  handleBookPurge?: (book: Book) => void;
  handleBookMetadataUpdate?: (book: Book, updatedMetadata: BookMetadata) => void;
}

// Purge is an opt-in toggle on the local library deletion confirmation.
type DeleteMenuAction = 'delete';

interface DeleteConfig {
  title: string;
  message: string;
  handler?: (book: Book) => void;
  showPurgeToggle?: boolean;
}

const BookDetailModal: React.FC<BookDetailModalProps> = ({
  book,
  isOpen,
  onClose,
  handleBookDelete,
  handleBookPurge,
  handleBookMetadataUpdate,
}) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const { safeAreaInsets } = useThemeStore();
  const [activeDeleteAction, setActiveDeleteAction] = useState<DeleteMenuAction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [bookMeta, setBookMeta] = useState<BookMetadata | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  // The parent owns the `book` prop and does not re-pass it after a metadata
  // save, so the details view tracks the saved book locally to refresh its
  // cover/title/author immediately (otherwise it shows the stale prop).
  const [displayBook, setDisplayBook] = useState<Book>(book);

  // Initialize metadata edit hook
  const {
    editedMeta,
    lockedFields,
    fieldErrors,
    handleFieldChange,
    handleToggleFieldLock,
    handleLockAll,
    handleUnlockAll,
    resetToOriginal,
  } = useMetadataEdit(bookMeta);

  const deleteConfigs: Record<DeleteMenuAction, DeleteConfig> = {
    delete: {
      title: _('Confirm Deletion'),
      message: _('Are you sure to delete the selected book?'),
      handler: handleBookDelete,
      showPurgeToggle: !!handleBookPurge,
    },
  };

  useEffect(() => {
    const fetchBookDetails = async () => {
      const appService = await envConfig.getAppService();
      try {
        let details = book.metadata || null;
        if (!details && book.downloadedAt) {
          details = await appService.fetchBookDetails(book);
        }
        setBookMeta(details);
        const size = await appService.getBookFileSize(book);
        setFileSize(size);
      } finally {
      }
    };
    fetchBookDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book]);

  useEffect(() => {
    setDisplayBook(book);
  }, [book]);

  const handleClose = () => {
    setBookMeta(null);
    setEditMode(false);
    setActiveDeleteAction(null);
    onClose();
  };

  const handleEditMetadata = () => {
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    resetToOriginal();
    setEditMode(false);
  };

  const handleSaveMetadata = () => {
    if (editedMeta && handleBookMetadataUpdate) {
      setBookMeta({ ...editedMeta });
      // Capture the updated book before handleBookMetadataUpdate clears the
      // temporary cover fields on editedMeta, so the view refreshes its cover.
      setDisplayBook(getBookWithUpdatedMetadata(book, editedMeta));
      handleBookMetadataUpdate(book, editedMeta);
      setEditMode(false);
    }
  };

  const handleDeleteAction = (action: DeleteMenuAction) => {
    setActiveDeleteAction(action);
  };

  const confirmDeleteAction = async (purgeData: boolean) => {
    if (!activeDeleteAction) return;

    const config = deleteConfigs[activeDeleteAction];
    handleClose();

    // A full purge is optional when removing the book from the local library.
    if (activeDeleteAction === 'delete' && purgeData && handleBookPurge) {
      handleBookPurge(book);
    } else if (config.handler) {
      config.handler(book);
    }
  };

  const cancelDeleteAction = () => {
    setActiveDeleteAction(null);
  };

  const handleDelete = () => handleDeleteAction('delete');

  const handleBookExport = async () => {
    setIsLoading(true);
    setTimeout(async () => {
      const success = await appService?.exportBook(book);
      setIsLoading(false);
      if (!isWebAppPlatform()) {
        eventDispatcher.dispatch('toast', {
          type: success ? 'info' : 'error',
          message: success ? _('Book exported successfully.') : _('Failed to export the book.'),
        });
      }
    }, 0);
  };

  const currentDeleteConfig = activeDeleteAction ? deleteConfigs[activeDeleteAction] : null;

  return (
    <>
      <div className='fixed inset-0 z-50 flex items-center justify-center'>
        <Dialog
          title={editMode ? _('Edit Metadata') : _('Book Details')}
          isOpen={isOpen}
          onClose={handleClose}
          boxClassName={clsx(
            editMode ? 'sm:min-w-[600px] sm:max-w-[600px]' : 'sm:min-w-[480px] sm:max-w-[480px]',
            'sm:h-auto sm:max-h-[90%]',
          )}
          contentClassName='!px-6 !py-4'
        >
          <div className='flex w-full select-text items-start justify-center'>
            {editMode && bookMeta ? (
              <BookDetailEdit
                book={book}
                metadata={editedMeta}
                lockedFields={lockedFields}
                fieldErrors={fieldErrors}
                onFieldChange={handleFieldChange}
                onToggleFieldLock={handleToggleFieldLock}
                onLockAll={handleLockAll}
                onUnlockAll={handleUnlockAll}
                onCancel={handleCancelEdit}
                onReset={resetToOriginal}
                onSave={handleSaveMetadata}
              />
            ) : (
              <BookDetailView
                book={displayBook}
                metadata={bookMeta}
                fileSize={fileSize}
                onEdit={handleBookMetadataUpdate ? handleEditMetadata : undefined}
                onDelete={handleBookDelete ? handleDelete : undefined}
                onExport={handleBookExport}
              />
            )}
          </div>
        </Dialog>

        {isLoading && (
          <div className='fixed inset-0 z-50 flex items-center justify-center'>
            <Spinner loading />
          </div>
        )}

        {activeDeleteAction && currentDeleteConfig && (
          <div
            className={clsx('fixed bottom-0 left-0 right-0 z-50 flex justify-center')}
            style={{
              paddingBottom: `${(safeAreaInsets?.bottom || 0) + 16}px`,
            }}
          >
            <DeleteConfirmAlert
              title={currentDeleteConfig.title}
              message={currentDeleteConfig.message}
              showPurgeToggle={currentDeleteConfig.showPurgeToggle}
              onCancel={cancelDeleteAction}
              onConfirm={confirmDeleteAction}
            />
          </div>
        )}
      </div>
    </>
  );
};

export default BookDetailModal;
