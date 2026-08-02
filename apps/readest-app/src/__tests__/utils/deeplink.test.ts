import { describe, it, expect } from 'vitest';
import { buildAnnotationUrl } from '../../utils/deeplink';

describe('buildAnnotationUrl', () => {
  const link = { bookHash: 'abc', noteId: 'n1', cfi: '/6/4!/4/2' };

  it('builds the BabelLeaf custom-scheme URL', () => {
    const url = buildAnnotationUrl(link, 'app');
    expect(url.startsWith('babelleaf://book/abc/annotation/n1')).toBe(true);
  });

  it('preserves the cfi query', () => {
    const encoded = encodeURIComponent(link.cfi);
    expect(buildAnnotationUrl(link, 'app')).toContain(`cfi=${encoded}`);
  });

  it('omits the cfi query when no cfi is provided', () => {
    const url = buildAnnotationUrl({ bookHash: 'abc', noteId: 'n1' }, 'app');
    expect(url).toBe('babelleaf://book/abc/annotation/n1');
  });
});
