import { describe, expect, test } from 'vitest';
import {
  createTranslationGlossary,
  getApplicableGlossaryEntries,
  parseTranslationGlossary,
  protectGlossaryTerms,
  restoreGlossaryTerms,
} from '@/services/translators/glossary';

describe('translation glossary', () => {
  test('protects longest terms and restores the configured target spelling', () => {
    const glossary = createTranslationGlossary([
      { source: 'New', target: '新' },
      { source: 'New York', target: '纽约' },
      { source: 'Alice', target: '爱丽丝', sourceLang: 'en', targetLang: 'zh-CN' },
    ]);
    const entries = getApplicableGlossaryEntries(glossary, 'en', 'zh-CN');
    const protectedText = protectGlossaryTerms('Alice visits New York.', entries);

    expect(protectedText.text).not.toContain('New York');
    expect(protectedText.text).toContain('__BABELLEAF_GLOSSARY_');
    const translated = protectedText.text.replace('Alice', '爱丽丝');
    expect(restoreGlossaryTerms(translated, protectedText.bindings)).toBe('爱丽丝 visits 纽约.');
  });

  test('filters entries by direction and rejects duplicate ids', () => {
    const glossary = createTranslationGlossary([
      { source: 'cat', target: '猫', sourceLang: 'en', targetLang: 'zh-CN' },
      { source: 'chat', target: '聊天', sourceLang: 'en', targetLang: 'zh-CN', enabled: false },
    ]);
    expect(getApplicableGlossaryEntries(glossary, 'ja', 'zh-CN')).toHaveLength(0);
    expect(getApplicableGlossaryEntries(glossary, 'en', 'zh-CN')).toHaveLength(1);

    expect(() =>
      parseTranslationGlossary({
        ...glossary,
        entries: [glossary.entries[0], { ...glossary.entries[0] }],
      }),
    ).toThrow('Duplicate');
  });
});
