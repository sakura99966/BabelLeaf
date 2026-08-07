import {
  getEffectiveComicRegion,
  getComicRegionSourceText,
  type ComicOverlayStyle,
  type ComicWorkspacePage,
  type EffectiveComicRegion,
} from './comicWorkspace';

export interface ComicOverlayBlock {
  id: string;
  pageId: string;
  sourceText: string;
  translatedText: string;
  polygon: Array<{ x: number; y: number }>;
  bounds: { x: number; y: number; width: number; height: number };
  orientation: EffectiveComicRegion['orientation'];
  language?: string;
  readingOrder: number;
  rotationDeg: number;
  style?: ComicOverlayStyle;
}

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const bounds = (polygon: ComicOverlayBlock['polygon']) => {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(1, Math.max(...xs) - x),
    height: Math.max(1, Math.max(...ys) - y),
  };
};

/** Build only non-stale translated regions for a page overlay. */
export const createComicOverlayBlocks = (page: ComicWorkspacePage): ComicOverlayBlock[] =>
  page.regions
    .map((region) => {
      const effective = getEffectiveComicRegion(region);
      const sourceText = getComicRegionSourceText(region);
      const translation = region.translation;
      const translatedText = translation?.translatedText?.trim();
      if (
        !effective ||
        !sourceText ||
        !translation ||
        !translatedText ||
        translation?.stale ||
        (translation.status !== 'translated' && translation.status !== 'reviewed')
      ) {
        return null;
      }
      const polygon = effective.polygon.map((point) => ({
        x: Math.max(0, Math.min(page.width, point.x)),
        y: Math.max(0, Math.min(page.height, point.y)),
      }));
      if (polygon.length < 3) return null;
      return {
        id: effective.id,
        pageId: page.pageId,
        sourceText: cleanText(sourceText),
        translatedText: cleanText(translatedText),
        polygon,
        bounds: bounds(polygon),
        orientation: effective.orientation,
        ...(effective.language ? { language: effective.language } : {}),
        readingOrder: effective.readingOrder,
        rotationDeg: effective.rotationDeg,
        ...(effective.overlay?.style ? { style: { ...effective.overlay.style } } : {}),
      } satisfies ComicOverlayBlock;
    })
    .filter((block): block is ComicOverlayBlock => block !== null)
    .sort(
      (left, right) => left.readingOrder - right.readingOrder || left.id.localeCompare(right.id),
    );

export const comicOverlayPolygonToCss = (
  polygon: ComicOverlayBlock['polygon'],
  width: number,
  height: number,
): string =>
  polygon
    .map(
      (point) =>
        `${((point.x / Math.max(1, width)) * 100).toFixed(4)}% ${((point.y / Math.max(1, height)) * 100).toFixed(4)}%`,
    )
    .join(', ');
