import type { ComicOverlayStyle, ComicWorkspacePage } from './comicWorkspace';
import { createComicOverlayBlocks, type ComicOverlayBlock } from './comicOverlay';

export const COMIC_TYPESETTING_VERSION = 1 as const;
export const MAX_COMIC_TYPESETTING_CHARS = 500_000;
export const MAX_COMIC_TYPESETTING_LINES = 2_000;

export type ComicTextDirection = 'ltr' | 'rtl' | 'ttb';
export type ComicTextFitMode = 'shrink' | 'clip' | 'overflow';

export interface ComicTypesetStyle extends ComicOverlayStyle {
  direction?: ComicTextDirection;
  fit?: ComicTextFitMode;
  maxLines?: number;
  letterSpacingPx?: number;
  wordSpacingPx?: number;
}

export interface ComicTypesetLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSizePx: number;
}

export interface ComicTypesetLayout {
  version: typeof COMIC_TYPESETTING_VERSION;
  regionId: string;
  pageId: string;
  sourceText: string;
  translatedText: string;
  polygon: Array<{ x: number; y: number }>;
  bounds: { x: number; y: number; width: number; height: number };
  style: ComicTypesetStyle;
  lines: ComicTypesetLine[];
  fontSizePx: number;
  direction: ComicTextDirection;
  overflow: boolean;
  clippedCharacters: number;
}

export interface ComicTypesetInput {
  region: ComicOverlayBlock;
  style?: ComicTypesetStyle;
  measureText?: (text: string, style: { fontSizePx: number; fontFamily?: string }) => number;
}

export class ComicTypesettingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComicTypesettingError';
  }
}

const DEFAULT_STYLE: Required<
  Pick<
    ComicTypesetStyle,
    | 'fontSizePx'
    | 'textAlign'
    | 'writingMode'
    | 'lineHeight'
    | 'paddingPx'
    | 'fit'
    | 'direction'
    | 'maxLines'
    | 'letterSpacingPx'
    | 'wordSpacingPx'
  >
> = {
  fontSizePx: 24,
  textAlign: 'center',
  writingMode: 'horizontal-tb',
  lineHeight: 1.2,
  paddingPx: 4,
  fit: 'shrink',
  direction: 'ltr',
  maxLines: 64,
  letterSpacingPx: 0,
  wordSpacingPx: 0,
};

const finite = (value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ComicTypesettingError(`Invalid typesetting value: ${field}`);
  }
  return value;
};

const normalizeStyle = (style: ComicTypesetStyle | undefined): ComicTypesetStyle => {
  const inferredDirection =
    style?.direction ?? (style?.writingMode === 'vertical-rl' ? 'ttb' : 'ltr');
  const merged = { ...DEFAULT_STYLE, ...(style ?? {}), direction: inferredDirection };
  if (
    merged.fontFamily !== undefined &&
    (typeof merged.fontFamily !== 'string' || merged.fontFamily.length > 128)
  ) {
    throw new ComicTypesettingError('Typesetting font family is invalid');
  }
  for (const [field, value] of [
    ['color', merged.color],
    ['outlineColor', merged.outlineColor],
    ['backgroundColor', merged.backgroundColor],
  ] as const) {
    if (value !== undefined && (typeof value !== 'string' || value.length > 64)) {
      throw new ComicTypesettingError(`Typesetting ${field} is invalid`);
    }
  }
  if (merged.textAlign !== undefined && !['start', 'center', 'end'].includes(merged.textAlign)) {
    throw new ComicTypesettingError('Typesetting text alignment is invalid');
  }
  if (
    merged.writingMode !== undefined &&
    !['horizontal-tb', 'vertical-rl'].includes(merged.writingMode)
  ) {
    throw new ComicTypesettingError('Typesetting writing mode is invalid');
  }
  finite(merged.outlineWidthPx ?? 0, 'outlineWidthPx', 0, 32);
  finite(merged.rotationDeg ?? 0, 'rotationDeg', -360, 360);
  if (merged.fontSizePx < 4 || merged.fontSizePx > 256) {
    throw new ComicTypesettingError('Typesetting font size is outside the supported range');
  }
  if (merged.lineHeight < 0.5 || merged.lineHeight > 4) {
    throw new ComicTypesettingError('Typesetting line height is outside the supported range');
  }
  if (!['shrink', 'clip', 'overflow'].includes(merged.fit)) {
    throw new ComicTypesettingError('Unsupported typesetting fit mode');
  }
  if (!['ltr', 'rtl', 'ttb'].includes(merged.direction)) {
    throw new ComicTypesettingError('Unsupported typesetting direction');
  }
  if (merged.maxLines < 1 || merged.maxLines > MAX_COMIC_TYPESETTING_LINES) {
    throw new ComicTypesettingError('Typesetting line count exceeds resource limits');
  }
  return {
    ...style,
    fontSizePx: finite(merged.fontSizePx, 'fontSizePx', 4, 256),
    lineHeight: finite(merged.lineHeight, 'lineHeight', 0.5, 4),
    paddingPx: finite(merged.paddingPx, 'paddingPx', 0, 128),
    letterSpacingPx: finite(merged.letterSpacingPx, 'letterSpacingPx', -32, 64),
    wordSpacingPx: finite(merged.wordSpacingPx, 'wordSpacingPx', -32, 128),
    textAlign: merged.textAlign,
    writingMode: merged.writingMode,
    fit: merged.fit,
    direction: merged.direction,
    maxLines: Math.floor(merged.maxLines),
  };
};

/** Validates persisted user-editable style values before they reach a renderer. */
export const parseComicTypesetStyle = (value: unknown): ComicTypesetStyle => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ComicTypesettingError('Invalid persisted comic typesetting style');
  }
  return normalizeStyle(value as ComicTypesetStyle);
};

const defaultMeasure = (text: string, style: { fontSizePx: number }): number =>
  [...text].reduce(
    (width, character) => width + style.fontSizePx * (/[\u0000-\u00ff]/.test(character) ? 0.55 : 1),
    0,
  );

const splitCharacters = (text: string): string[] => [...text];

const wrapText = (
  text: string,
  maxWidth: number,
  style: ComicTypesetStyle,
  measureText: (text: string, style: { fontSizePx: number; fontFamily?: string }) => number,
): { lines: string[]; clippedCharacters: number } => {
  const characters = splitCharacters(text);
  const lines: string[] = [];
  let line = '';
  let clippedCharacters = 0;
  const pushLine = () => {
    if (line || lines.length === 0) lines.push(line);
    line = '';
  };
  for (const character of characters) {
    const candidate = line + character;
    const width =
      measureText(candidate, {
        fontSizePx: style.fontSizePx!,
        ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
      }) +
      Math.max(0, candidate.length - 1) * (style.letterSpacingPx ?? 0);
    if (line && width > maxWidth) pushLine();
    if (!line && measureText(character, { fontSizePx: style.fontSizePx! }) > maxWidth) {
      clippedCharacters += 1;
      continue;
    }
    line += character;
  }
  pushLine();
  if (style.direction === 'rtl')
    return { lines: lines.map((value) => value.split('').reverse().join('')), clippedCharacters };
  return { lines, clippedCharacters };
};

const makeLines = (
  region: ComicOverlayBlock,
  style: ComicTypesetStyle,
  fontSizePx: number,
  measureText: (text: string, style: { fontSizePx: number; fontFamily?: string }) => number,
): { lines: ComicTypesetLine[]; overflow: boolean; clippedCharacters: number } => {
  const padding = style.paddingPx ?? 0;
  const maxWidth = Math.max(1, region.bounds.width - padding * 2);
  const maxHeight = Math.max(1, region.bounds.height - padding * 2);
  const direction = style.direction ?? (style.writingMode === 'vertical-rl' ? 'ttb' : 'ltr');
  const effectiveStyle = { ...style, fontSizePx, direction };
  const lineHeight = fontSizePx * (style.lineHeight ?? 1.2);
  if (direction === 'ttb') {
    const characters = splitCharacters(region.translatedText);
    const charactersPerColumn = Math.max(1, Math.floor(maxHeight / lineHeight));
    const maxColumnsByWidth = Math.max(1, Math.floor(maxWidth / lineHeight));
    const maxColumns = Math.min(style.maxLines ?? maxColumnsByWidth, maxColumnsByWidth);
    const visibleCharacters = Math.min(characters.length, charactersPerColumn * maxColumns);
    const lines = characters.slice(0, visibleCharacters).map((text, index) => {
      const column = Math.floor(index / charactersPerColumn);
      const row = index % charactersPerColumn;
      return {
        text,
        x: region.bounds.x + region.bounds.width - padding - (column + 1) * lineHeight,
        y: region.bounds.y + padding + row * lineHeight,
        width: lineHeight,
        height: fontSizePx,
        fontSizePx,
      };
    });
    return {
      lines,
      overflow: visibleCharacters < characters.length,
      clippedCharacters: Math.max(0, characters.length - visibleCharacters),
    };
  }
  const wrapped = wrapText(region.translatedText, maxWidth, effectiveStyle, measureText);
  const maxLinesByHeight = Math.max(1, Math.floor(maxHeight / lineHeight));
  const maxLines = Math.min(style.maxLines ?? maxLinesByHeight, maxLinesByHeight);
  const overflow = wrapped.lines.length > maxLines || wrapped.clippedCharacters > 0;
  const visibleLines = wrapped.lines.slice(0, maxLines);
  const lines = visibleLines.map((text, index) => {
    const width = Math.min(
      maxWidth,
      measureText(text, {
        fontSizePx,
        ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
      }),
    );
    const x =
      style.textAlign === 'start'
        ? region.bounds.x + padding
        : style.textAlign === 'end'
          ? region.bounds.x + region.bounds.width - padding - width
          : region.bounds.x + (region.bounds.width - width) / 2;
    return {
      text,
      x,
      y: region.bounds.y + padding + index * lineHeight,
      width,
      height: lineHeight,
      fontSizePx,
    };
  });
  return {
    lines,
    overflow,
    clippedCharacters:
      wrapped.clippedCharacters +
      (overflow && wrapped.lines.length > maxLines
        ? wrapped.lines.slice(maxLines).join('').length
        : 0),
  };
};

export const layoutComicText = (input: ComicTypesetInput): ComicTypesetLayout => {
  const region = input.region;
  const sourceText = region.sourceText.trim();
  const translatedText = region.translatedText.trim();
  if (!sourceText || !translatedText) throw new ComicTypesettingError('Typesetting text is empty');
  if (translatedText.length > MAX_COMIC_TYPESETTING_CHARS) {
    throw new ComicTypesettingError('Typesetting text exceeds resource limits');
  }
  const style = normalizeStyle(input.style);
  const measureText = input.measureText ?? defaultMeasure;
  let fontSizePx = style.fontSizePx!;
  let layout = makeLines(region, style, fontSizePx, measureText);
  if (style.fit === 'shrink' && layout.overflow) {
    while (fontSizePx > 4 && layout.overflow) {
      fontSizePx = Math.max(4, fontSizePx - 1);
      layout = makeLines(region, style, fontSizePx, measureText);
    }
  }
  return {
    version: COMIC_TYPESETTING_VERSION,
    regionId: region.id,
    pageId: region.pageId,
    sourceText,
    translatedText,
    polygon: region.polygon.map((point) => ({ ...point })),
    bounds: { ...region.bounds },
    style,
    lines: layout.lines,
    fontSizePx,
    direction: style.direction ?? (style.writingMode === 'vertical-rl' ? 'ttb' : 'ltr'),
    overflow: style.fit === 'overflow' ? false : layout.overflow,
    clippedCharacters: style.fit === 'overflow' ? 0 : layout.clippedCharacters,
  };
};

export const layoutComicPageText = (
  page: ComicWorkspacePage,
  styles: Readonly<Record<string, ComicTypesetStyle>> = {},
  measureText?: ComicTypesetInput['measureText'],
): ComicTypesetLayout[] =>
  createComicOverlayBlocks(page).map((region) =>
    layoutComicText({
      region,
      style: styles[region.id] ?? region.style,
      ...(measureText ? { measureText } : {}),
    }),
  );

export const serializeComicTypesetLayout = (layout: ComicTypesetLayout): string =>
  JSON.stringify(layout, null, 2);
