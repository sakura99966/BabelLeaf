import type { ComicTextRegion } from './comicWorkerProtocol';
import type { OcrPageRecord } from './ocrSidecar';

export interface OcrTextLayerBlock {
  id: string;
  pageId: string;
  text: string;
  language?: string;
  orientation: ComicTextRegion['orientation'];
  readingOrder: number;
  polygon: Array<{ x: number; y: number }>;
  bounds: { x: number; y: number; width: number; height: number };
  ruby?: ComicTextRegion['ruby'];
}

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const getBounds = (polygon: OcrTextLayerBlock['polygon']) => {
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

/** Convert OCR polygons to a stable, selectable overlay model. */
export const createOcrTextLayerBlocks = (
  page: Pick<OcrPageRecord, 'pageId' | 'width' | 'height' | 'regions'>,
): OcrTextLayerBlock[] =>
  page.regions
    .filter((region) => typeof region.text === 'string' && cleanText(region.text).length > 0)
    .sort(
      (left, right) => left.readingOrder - right.readingOrder || left.id.localeCompare(right.id),
    )
    .map((region) => {
      const polygon = region.polygon.map((point) => ({
        x: Math.max(0, Math.min(page.width, point.x)),
        y: Math.max(0, Math.min(page.height, point.y)),
      }));
      return {
        id: region.id,
        pageId: page.pageId,
        text: cleanText(region.text!),
        ...(region.language ? { language: region.language } : {}),
        orientation: region.orientation,
        readingOrder: region.readingOrder,
        polygon,
        bounds: getBounds(polygon),
        ...(region.ruby ? { ruby: region.ruby.map((ruby) => ({ ...ruby })) } : {}),
      };
    });

export const ocrPageToPlainText = (page: Pick<OcrPageRecord, 'regions'>): string =>
  page.regions
    .filter((region) => typeof region.text === 'string' && cleanText(region.text).length > 0)
    .sort(
      (left, right) => left.readingOrder - right.readingOrder || left.id.localeCompare(right.id),
    )
    .map((region) => cleanText(region.text!))
    .join('\n');

export const ocrPolygonToCss = (
  polygon: OcrTextLayerBlock['polygon'],
  width: number,
  height: number,
): string =>
  polygon
    .map(
      (point) =>
        `${((point.x / Math.max(1, width)) * 100).toFixed(4)}% ${((point.y / Math.max(1, height)) * 100).toFixed(4)}%`,
    )
    .join(', ');
