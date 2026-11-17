import { useState, useCallback, useEffect } from 'react';
import { getTranslator, getTranslators } from '@/services/translators';
import { getFromCache, storeInCache, UseTranslatorOptions } from '@/services/translators';
import { polish, preprocess } from '@/services/translators';
import { getLocale } from '@/utils/misc';

export function useTranslator({
  provider = 'deepseek',
  sourceLang = 'AUTO',
  targetLang = 'EN',
  enablePolishing = true,
  enablePreprocessing = true,
}: UseTranslatorOptions = {}) {
  const [loading, setLoading] = useState(false);
  // Resolve the current choice synchronously. A deferred update can dispatch
  // the first request after a provider switch to the previous cloud provider.
  const translator = getTranslator(provider);
  const [translators] = useState(() => getTranslators());

  useEffect(() => {
    setLoading(false);
  }, [provider, sourceLang, targetLang]);

  const translate = useCallback(
    async (
      input: string[],
      options?: { source?: string; target?: string; useCache?: boolean; signal?: AbortSignal },
    ): Promise<string[]> => {
      const checkCancelled = () => {
        if (options?.signal?.aborted)
          throw new DOMException('Translation request cancelled', 'AbortError');
      };
      checkCancelled();
      const sourceLanguage = options?.source || sourceLang;
      const targetLanguage = options?.target || targetLang || getLocale();
      const textsToTranslate = enablePreprocessing ? preprocess(input) : input;

      if (textsToTranslate.length === 0 || textsToTranslate.every((t) => !t?.trim())) {
        return textsToTranslate;
      }

      const textsNeedingTranslation: string[] = [];
      const indicesNeedingTranslation: number[] = [];
      const context = translator?.cacheContext?.();
      const results = [...textsToTranslate];

      const cached = await Promise.all(
        textsToTranslate.map((text) =>
          options?.useCache === false || !text?.trim()
            ? Promise.resolve(null)
            : getFromCache(text, sourceLanguage, targetLanguage, provider, context),
        ),
      );
      checkCancelled();
      textsToTranslate.forEach((text, index) => {
        if (!text?.trim()) return;
        if (cached[index]) results[index] = cached[index]!;
        else {
          textsNeedingTranslation.push(text);
          indicesNeedingTranslation.push(index);
        }
      });

      if (textsNeedingTranslation.length === 0) {
        return enablePolishing ? polish(results, targetLanguage) : results;
      }

      setLoading(true);

      try {
        if (!translator) {
          throw new Error(`No translator found for provider: ${provider}`);
        }
        if (translator.cacheContext?.() !== context)
          throw new Error(
            'Translation context changed before dispatch; retry with the current model',
          );
        const translatedTexts = await translator.translate(
          textsNeedingTranslation,
          sourceLanguage,
          targetLanguage,
          options?.signal,
        );
        checkCancelled();
        if (
          translatedTexts.length !== textsNeedingTranslation.length ||
          translatedTexts.some((text) => !text?.trim())
        )
          throw new Error('Translation provider returned incomplete results');

        await Promise.all(
          textsNeedingTranslation.map(async (text, index) => {
            return storeInCache(
              text,
              translatedTexts[index] || '',
              sourceLanguage,
              targetLanguage,
              provider,
              context,
            );
          }),
        );

        indicesNeedingTranslation.forEach((originalIndex, translationIndex) => {
          results[originalIndex] = translatedTexts[translationIndex] || '';
        });

        setLoading(false);
        return enablePolishing ? polish(results, targetLanguage) : results;
      } catch (err) {
        setLoading(false);
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
    [provider, sourceLang, targetLang, translator, enablePolishing, enablePreprocessing],
  );

  return {
    translate,
    translator,
    translators,
    loading,
  };
}
