import { useState, useCallback, useEffect } from 'react';
import { getTranslator, getTranslators, type TranslatorName } from '@/services/translators';
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
  const [selectedProvider, setSelectedProvider] = useState(provider);
  const [translator, setTransltor] = useState(() => getTranslator(provider));
  const [translators] = useState(() => getTranslators());

  useEffect(() => {
    setLoading(false);
  }, [provider, sourceLang, targetLang]);

  useEffect(() => {
    // Keep the user's explicit provider selection. Falling back to another
    // configured provider could send book text to an unintended service.
    const selectedTranslator = getTranslator(provider);
    if (!selectedTranslator) {
      setTransltor(undefined);
      return;
    }
    const selectedProviderName = selectedTranslator.name as TranslatorName;
    setTransltor(getTranslator(selectedProviderName));
    setSelectedProvider(selectedProviderName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

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
      const selectedTranslator = translators.find((t) => t.name === selectedProvider);
      const context = selectedTranslator?.cacheContext?.();
      const results = [...textsToTranslate];

      const cached = await Promise.all(
        textsToTranslate.map((text) =>
          options?.useCache === false || !text?.trim()
            ? Promise.resolve(null)
            : getFromCache(text, sourceLanguage, targetLanguage, selectedProvider, context),
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
        if (!selectedTranslator) {
          throw new Error(`No translator found for provider: ${selectedProvider}`);
        }
        if (selectedTranslator.cacheContext?.() !== context)
          throw new Error(
            'Translation context changed before dispatch; retry with the current model',
          );
        const translatedTexts = await selectedTranslator.translate(
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
              selectedProvider,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      selectedProvider,
      sourceLang,
      targetLang,
      translator,
      translators,
      enablePolishing,
      enablePreprocessing,
    ],
  );

  return {
    translate,
    translator,
    translators,
    loading,
  };
}
