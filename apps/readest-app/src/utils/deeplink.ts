export type AnnotationDeepLink = {
  bookHash: string;
  noteId: string;
  cfi?: string;
};

/**
 * Which form of annotation link markdown export embeds: the custom-scheme
 * `readest://` app deeplink or the universal `https://` web link.
 */
export type AnnotationLinkType = 'app';

/**
 * Build the custom-scheme URL. Kept as a parallel form for share-sheet flows
 * and direct deeplink scenarios. Markdown export uses the HTTPS form.
 */
export const buildAnnotationAppUrl = ({ bookHash, noteId, cfi }: AnnotationDeepLink): string => {
  const base = `babelleaf://book/${bookHash}/annotation/${noteId}`;
  return cfi ? `${base}?cfi=${encodeURIComponent(cfi)}` : base;
};

/**
 * Build the annotation link for the requested {@link AnnotationLinkType}.
 * `app` yields the custom-scheme deeplink; `web` yields the universal HTTPS form.
 */
export const buildAnnotationUrl = (
  link: AnnotationDeepLink,
  _linkType: AnnotationLinkType,
): string => buildAnnotationAppUrl(link);

/**
 * Parse an incoming readest:// or https://web.readest.com annotation URL.
 * Accepts the new hierarchical form (book/{hash}/annotation/{id}) and the
 * legacy flat form (annotation/{hash}/{id}) emitted by older Readwise syncs.
 * Returns null if the URL doesn't match.
 */
export const parseAnnotationDeepLink = (url: string): AnnotationDeepLink | null => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'babelleaf:') return null;

  // For readest:// URLs the URL parser stores the first path segment in the
  // host. Reconstruct a uniform segment list across both schemes.
  const segments = [parsed.host, ...parsed.pathname.split('/')].filter(Boolean);

  const cfiParam = parsed.searchParams.get('cfi');
  const cfi = cfiParam ? cfiParam : undefined;

  // Hierarchical: book/{hash}/annotation/{id}
  if (segments.length === 4 && segments[0] === 'book' && segments[2] === 'annotation') {
    return { bookHash: segments[1]!, noteId: segments[3]!, cfi };
  }

  return null;
};

/**
 * Parse an incoming readest:// or https://web.readest.com book-open URL.
 * Matches only the bare form `book/{hash}` (the widget tap target); the
 * 4-segment annotation form `book/{hash}/annotation/{id}` is handled by
 * parseAnnotationDeepLink and must NOT match here.
 */
export const parseBookDeepLink = (url: string): { bookHash: string; autoplay?: boolean } | null => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'babelleaf:') return null;

  const segments = [parsed.host, ...parsed.pathname.split('/')].filter(Boolean);

  if (segments.length === 2 && segments[0] === 'book' && segments[1]) {
    // `?autoplay=tts` is appended by the Android Auto cold-resume launch to ask
    // the reader to start read-aloud once the book is open. Only surface the
    // flag when set so the common shape stays `{ bookHash }`.
    if (parsed.searchParams.get('autoplay') === 'tts') {
      return { bookHash: segments[1], autoplay: true };
    }
    return { bookHash: segments[1] };
  }
  return null;
};
