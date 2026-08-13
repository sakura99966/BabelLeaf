import { useCallback, useEffect, useRef, useState } from 'react';
import { FoliateView } from '@/types/view';
import { UseTranslatorOptions } from '@/services/translators';
import {
  createTranslationArtifact,
  createTranslationSourceAnchor,
  hashAnchorText,
  TRANSLATION_PROMPT_VERSION,
  TranslationArtifactStore,
  upsertTranslationSegments,
} from '@/services/translators';
import { useReaderStore } from '@/store/readerStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useBookProgress } from '@/store/readerProgressStore';
import { useEnv } from '@/context/EnvContext';
import { useTranslator } from '@/hooks/useTranslator';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import { walkTextNodes } from '@/utils/walk';
import { debounce } from '@/utils/debounce';
import { getLocale } from '@/utils/misc';
import { getDirFromLanguage } from '@/utils/rtl';
import type { TranslationDisplayMode } from '@/types/book';

const resolveTranslationDisplayMode = (
  settings:
    | {
        translationDisplayMode?: TranslationDisplayMode;
        showTranslateSource?: boolean;
      }
    | null
    | undefined,
): TranslationDisplayMode =>
  settings?.translationDisplayMode ?? (settings?.showTranslateSource ? 'stacked' : 'translated');

export const applyTranslationDisplayMode = (
  element: HTMLElement,
  mode: TranslationDisplayMode,
  visible: boolean,
): void => {
  element.classList.remove(
    'translation-display-original',
    'translation-display-translated',
    'translation-display-stacked',
    'translation-display-columns',
  );
  element.classList.add(`translation-display-${mode}`);
  const originalTexts = JSON.parse(element.getAttribute('original-text-nodes') || '[]') as string[];
  const textNodes = Array.from(element.childNodes).filter(
    (node) => node.nodeType === Node.TEXT_NODE,
  ) as Text[];
  const showSource = !visible || mode !== 'translated';
  textNodes.forEach((textNode, index) => {
    textNode.textContent = showSource ? (originalTexts[index] ?? '') : '';
  });
  const translationTargets = element.querySelectorAll('.translation-target');
  translationTargets.forEach((target) => {
    target.classList.toggle('hidden', !visible || mode === 'original');
  });
};

export const createTranslationTargetNode = ({
  translatedText,
  lang,
  targetBlockClassName,
  hidden,
  widthLineBreak,
}: {
  translatedText: string;
  lang: string;
  targetBlockClassName: string;
  hidden: boolean;
  widthLineBreak: boolean;
}) => {
  const wrapper = document.createElement('font');
  wrapper.className = `translation-target ${hidden ? 'hidden' : ''}`;
  wrapper.setAttribute('translation-element-mark', '1');
  wrapper.setAttribute('lang', lang);
  // Set the base direction from the target language so justified RTL text
  // (e.g. Arabic) aligns to the start (right) instead of inheriting the
  // source document's LTR direction.
  wrapper.setAttribute('dir', getDirFromLanguage(lang));
  if (widthLineBreak) {
    wrapper.appendChild(document.createElement('br'));
  }

  const blockWrapper = document.createElement('font');
  blockWrapper.className = `translation-target ${targetBlockClassName}`;

  const inner = document.createElement('font');
  inner.className = 'translation-target target-inner target-inner-theme-none';
  inner.textContent = translatedText;

  blockWrapper.appendChild(inner);
  wrapper.appendChild(blockWrapper);
  return wrapper;
};

export function useTextTranslation(
  bookKey: string,
  view: FoliateView | HTMLElement | null,
  widthLineBreak = false,
  targetBlockClassName = 'translation-target-block',
) {
  const _ = useTranslation();
  const { appService } = useEnv();
  const getViewSettings = useReaderStore((s) => s.getViewSettings);
  const getBookData = useBookDataStore((s) => s.getBookData);
  const setIsLoading = useReaderStore((s) => s.setIsLoading);
  const viewSettings = getViewSettings(bookKey);
  const bookHash = getBookData(bookKey)?.book?.hash ?? bookKey.split('-')[0] ?? bookKey;
  // Reactive: triggers translate-in-range on every page turn so the
  // visible viewport's translations refresh. Reads from
  // readerProgressStore only.
  const progress = useBookProgress(bookKey);

  const enabled = useRef(viewSettings?.translationEnabled);
  const [provider, setProvider] = useState(viewSettings?.translationProvider);
  const [targetLang, setTargetLang] = useState(viewSettings?.translateTargetLang);
  const displayModeRef = useRef<TranslationDisplayMode>(
    resolveTranslationDisplayMode(viewSettings),
  );

  const { translate } = useTranslator({
    provider,
    targetLang: targetLang || getLocale(),
  } as UseTranslatorOptions);

  const translateRef = useRef(translate);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const translatedElements = useRef<HTMLElement[]>([]);
  const allTextNodes = useRef<HTMLElement[]>([]);
  const translationQueue = useRef<HTMLElement[]>([]);
  const activeTranslations = useRef(0);
  const MAX_CONCURRENT_TRANSLATIONS = 5;
  const pendingDOMUpdates = useRef<Array<() => void>>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const artifactStoreRef = useRef<TranslationArtifactStore | null>(null);
  const artifactRef = useRef<Awaited<ReturnType<TranslationArtifactStore['load']>>>(null);
  const artifactReadyRef = useRef<Promise<void>>(Promise.resolve());
  const artifactProvider = provider || 'deepseek';
  const artifactTargetLang = targetLang || getLocale();

  useEffect(() => {
    let cancelled = false;
    artifactRef.current = null;
    artifactStoreRef.current = null;
    if (!appService || !bookHash || !artifactProvider || !artifactTargetLang) {
      artifactReadyRef.current = Promise.resolve();
      return () => {
        cancelled = true;
      };
    }

    const store = new TranslationArtifactStore(appService);
    artifactStoreRef.current = store;
    artifactReadyRef.current = (async () => {
      try {
        const key = {
          bookHash,
          provider: artifactProvider,
          targetLang: artifactTargetLang,
        };
        const loaded = await store.load(key);
        if (!cancelled) {
          artifactRef.current =
            loaded ??
            createTranslationArtifact({
              bookHash,
              provider: artifactProvider,
              promptVersion: TRANSLATION_PROMPT_VERSION,
              sourceLang: 'AUTO',
              targetLang: artifactTargetLang,
            });
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to load local translation sidecar', error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appService, artifactProvider, artifactTargetLang, bookHash]);

  const toggleTranslationVisibility = (visible: boolean) => {
    const mode = displayModeRef.current;
    translatedElements.current.forEach((element) => {
      applyTranslationDisplayMode(element, mode, visible);
    });
  };

  useEffect(() => {
    translateRef.current = translate;
  }, [translate]);

  const hintInitialTranslating = () => {
    setIsLoading(bookKey, true);
    eventDispatcher.dispatch('hint', {
      bookKey,
      message: _('Translating...'),
    });
    hintTimerRef.current = setTimeout(() => {
      hintTimerRef.current = null;
      setIsLoading(bookKey, false);
    }, 2000);
  };

  const observeTextNodes = () => {
    if (!view || !enabled.current) return;

    const observer = createTranslationObserver();
    observerRef.current = observer;
    const nodes = walkTextNodes(view, ['pre', 'code', 'math']);
    allTextNodes.current = nodes;
    nodes.forEach((el) => observer.observe(el));
  };

  const updateTranslation = () => {
    translationQueue.current = [];
    activeTranslations.current = 0;
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    pendingDOMUpdates.current = [];
    translatedElements.current.forEach((element) => {
      const translationTargets = element.querySelectorAll('.translation-target');
      translationTargets.forEach((target) => target.remove());
    });

    translatedElements.current = [];
    if (viewSettings?.translationEnabled && view) {
      recreateTranslationObserver();
    }
  };

  const createTranslationObserver = () => {
    const visibleElements = new Set<HTMLElement>();
    return new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleElements.add(entry.target as HTMLElement);
          } else {
            visibleElements.delete(entry.target as HTMLElement);
          }
        }

        if (visibleElements.size === 0) return;

        const nodes = allTextNodes.current;
        if (nodes.length === 0) return;

        let firstIdx = nodes.length;
        let lastIdx = -1;
        for (const el of visibleElements) {
          const idx = nodes.indexOf(el);
          if (idx !== -1) {
            if (idx < firstIdx) firstIdx = idx;
            if (idx > lastIdx) lastIdx = idx;
          }
        }

        if (lastIdx === -1) return;

        const startIdx = Math.max(0, firstIdx - 1);
        const endIdx = Math.min(nodes.length - 1, lastIdx + 2);

        for (let i = startIdx; i <= endIdx; i++) {
          const node = nodes[i];
          if (node) {
            scheduleTranslation(node);
          }
        }
      },
      { threshold: 0 },
    );
  };

  const scheduleTranslation = (el: HTMLElement) => {
    if (!enabled.current) return;
    if (el.classList.contains('translation-target')) return;
    if (el.querySelector('.translation-target')) return;
    if (translationQueue.current.indexOf(el) !== -1) return;
    translationQueue.current.push(el);
    drainTranslationQueue();
  };

  const drainTranslationQueue = () => {
    while (
      activeTranslations.current < MAX_CONCURRENT_TRANSLATIONS &&
      translationQueue.current.length > 0
    ) {
      const el = translationQueue.current.shift()!;
      if (el.querySelector('.translation-target') || !enabled.current) continue;
      activeTranslations.current++;
      translateElement(el).finally(() => {
        activeTranslations.current--;
        drainTranslationQueue();
      });
    }
    if (translationQueue.current.length === 0 && activeTranslations.current === 0) {
      setTimeout(() => {
        setIsLoading(bookKey, false);
      }, 500);
    }
  };

  const batchDOMUpdate = (update: () => void) => {
    pendingDOMUpdates.current.push(update);
    if (!batchTimerRef.current) {
      batchTimerRef.current = setTimeout(() => {
        batchTimerRef.current = null;
        const updates = pendingDOMUpdates.current.splice(0);
        updates.forEach((fn) => fn());
      }, 50);
    }
  };

  const recreateTranslationObserver = () => {
    const observer = createTranslationObserver();
    observerRef.current?.disconnect();
    observerRef.current = observer;
    allTextNodes.current.forEach((el) => observer.observe(el));
  };

  const translateElement = async (el: HTMLElement) => {
    if (!enabled.current) return;
    const text = el.textContent?.replaceAll('\n', '').trim();
    if (!text) return;

    if (el.classList.contains('translation-target')) {
      return;
    }

    const updateSourceNodes = (element: HTMLElement) => {
      const hasDirectText = Array.from(element.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim() !== '',
      );
      if (hasDirectText) {
        element.classList.add('translation-source');

        const textNodes = Array.from(element.childNodes).filter(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim() !== '',
        );

        if (!element.hasAttribute('original-text-stored')) {
          element.setAttribute(
            'original-text-nodes',
            JSON.stringify(textNodes.map((node) => node.textContent)),
          );
          element.setAttribute('original-text-stored', 'true');
        }
      }
      const isSource = element.classList.contains('translation-source');
      if (isSource) {
        const textNodes = Array.from(element.childNodes).filter(
          (node) => node.nodeType === Node.TEXT_NODE,
        ) as Text[];

        const mode = displayModeRef.current;
        element.classList.remove(
          'translation-display-original',
          'translation-display-translated',
          'translation-display-stacked',
          'translation-display-columns',
        );
        element.classList.add(`translation-display-${mode}`);
        if (mode !== 'translated') {
          const originalTexts = JSON.parse(element.getAttribute('original-text-nodes') || '[]');
          textNodes.forEach((textNode, index) => {
            if (originalTexts[index] !== undefined) {
              textNode.textContent = originalTexts[index];
            }
          });
        } else if (enabled.current) {
          textNodes.forEach((textNode) => {
            textNode.textContent = '';
          });
        }
      }
      for (const child of Array.from(element.childNodes)) {
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const node = child as HTMLElement;
        if (!node.classList.contains('translation-target')) {
          updateSourceNodes(node);
        }
      }
    };

    const isReaderView = !!view && typeof view === 'object' && 'renderer' in view;
    const blockIndex = Math.max(0, allTextNodes.current.indexOf(el));
    const sourceAnchor = isReaderView
      ? createTranslationSourceAnchor({
          sectionIndex: progress?.index ?? 0,
          blockIndex,
          chunkIndex: 0,
          sourceText: text,
          sourceLocator: progress?.sectionHref,
        })
      : undefined;
    const segmentId = sourceAnchor
      ? `${sourceAnchor.sectionIndex}:${sourceAnchor.blockIndex}:${sourceAnchor.chunkIndex}:${hashAnchorText(text)}`
      : undefined;

    const appendTranslation = (translatedText: string) => {
      if (!translatedText || text === translatedText) return;
      const wrapper = createTranslationTargetNode({
        translatedText,
        lang: artifactTargetLang,
        targetBlockClassName,
        hidden: !enabled.current || displayModeRef.current === 'original',
        widthLineBreak,
      });

      if (el.querySelector('.translation-target')) return;
      batchDOMUpdate(() => {
        if (!enabled.current || el.querySelector('.translation-target')) return;
        updateSourceNodes(el);
        el.appendChild(wrapper);
        translatedElements.current.push(el);
      });
    };

    try {
      await artifactReadyRef.current;
      if (segmentId) {
        const persisted = artifactRef.current?.segments.find(
          (segment) => segment.id === segmentId && segment.sourceText === text,
        );
        if (persisted?.translatedText?.trim()) {
          appendTranslation(persisted.translatedText);
          return;
        }
      }

      const translated = await translateRef.current([text]);
      const translatedText = translated[0];
      if (!translatedText || text === translatedText) return;

      if (isReaderView && segmentId && sourceAnchor && artifactStoreRef.current) {
        const artifact =
          artifactRef.current ??
          createTranslationArtifact({
            bookHash,
            provider: artifactProvider,
            promptVersion: TRANSLATION_PROMPT_VERSION,
            sourceLang: 'AUTO',
            targetLang: artifactTargetLang,
          });
        const now = Date.now();
        const updated = upsertTranslationSegments(
          artifact,
          [
            {
              id: segmentId,
              sourceText: text,
              translatedText,
              machineTranslatedText: translatedText,
              sourceLang: 'AUTO',
              targetLang: artifactTargetLang,
              status: 'translated',
              sourceLocator: sourceAnchor.sourceLocator,
              sourceAnchor,
              updatedAt: now,
            },
          ],
          now,
        );
        artifactRef.current = updated;
        try {
          await artifactStoreRef.current.save(updated);
        } catch (error) {
          // A storage failure must not hide a translation already returned by
          // the provider. The next session can retry the sidecar write.
          console.warn('Failed to save local translation sidecar', error);
        }
      }

      appendTranslation(translatedText);
    } catch {
      console.warn('Translation failed');
    }
  };

  const findNodeIndicesInRange = (range: Range, nodes: HTMLElement[]) => {
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;

    let startIndex = -1;
    let endIndex = -1;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      if (node === startContainer || node.contains(startContainer)) {
        if (startIndex === -1) startIndex = i;
      }
      if (node === endContainer || node.contains(endContainer)) {
        endIndex = i;
      }
    }
    if (startIndex !== -1 && endIndex === -1) {
      endIndex = startIndex;
    }

    return { startIndex, endIndex };
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const translateInRange = useCallback(
    debounce((range: Range) => {
      const nodes = allTextNodes.current;
      if (nodes.length === 0) {
        console.warn('No text nodes available for translation.');
        return;
      }
      const { startIndex, endIndex } = findNodeIndicesInRange(range, nodes);
      if (startIndex === -1) {
        return;
      }
      const beforeContext = 2;
      const afterContext = 5;
      const beforeStart = Math.max(0, startIndex - beforeContext);
      const afterEnd = Math.min(nodes.length - 1, endIndex + afterContext);
      for (let i = beforeStart; i <= afterEnd; i++) {
        const node = nodes[i];
        if (node) {
          scheduleTranslation(node);
        }
      }
    }, 500),
    [scheduleTranslation],
  );

  useEffect(() => {
    if (enabled.current && progress) {
      const { range } = progress;
      translateInRange(range);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  useEffect(() => {
    if (!viewSettings) return;

    const enabledChanged = enabled.current !== viewSettings.translationEnabled;
    const providerChanged = provider !== viewSettings.translationProvider;
    const targetLangChanged = targetLang !== viewSettings.translateTargetLang;
    const nextDisplayMode = resolveTranslationDisplayMode(viewSettings);
    const displayModeChanged = displayModeRef.current !== nextDisplayMode;

    if (enabledChanged) {
      enabled.current = viewSettings.translationEnabled;
    }

    if (providerChanged) {
      setProvider(viewSettings.translationProvider);
    }

    if (targetLangChanged) {
      setTargetLang(viewSettings.translateTargetLang);
    }

    if (displayModeChanged) {
      displayModeRef.current = nextDisplayMode;
    }

    if (enabledChanged) {
      toggleTranslationVisibility(viewSettings.translationEnabled);
      if (enabled.current) {
        observeTextNodes();
      }
    } else if (displayModeChanged) {
      toggleTranslationVisibility(viewSettings.translationEnabled);
    } else if (providerChanged || targetLangChanged) {
      updateTranslation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookKey, viewSettings, provider, targetLang]);

  useEffect(() => {
    if (!view || !enabled.current) return;

    if ('renderer' in view) {
      view.addEventListener('load', observeTextNodes);
      view.addEventListener('load', hintInitialTranslating);
    } else {
      observeTextNodes();
    }
    return () => {
      if ('renderer' in view) {
        view.removeEventListener('load', observeTextNodes);
        view.removeEventListener('load', hintInitialTranslating);
      }
      observerRef.current?.disconnect();
      translatedElements.current = [];
      translationQueue.current = [];
      activeTranslations.current = 0;
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
      if (hintTimerRef.current) {
        clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }
      pendingDOMUpdates.current = [];
      setIsLoading(bookKey, false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
}
