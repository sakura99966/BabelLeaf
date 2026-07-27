import { describe, expect, test } from 'vitest';
import { mountAdditionalFonts } from '@/styles/fonts';

describe('BabelLeaf remote font policy', () => {
  test('does not inject remote stylesheets or font files into local reading documents', async () => {
    document.head.innerHTML = '';

    await mountAdditionalFonts(document, true);

    expect(document.head.querySelectorAll('link')).toHaveLength(0);
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    expect(document.head.innerHTML).not.toMatch(/https?:\/\//);
  });
});
