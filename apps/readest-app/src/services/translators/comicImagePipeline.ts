import { MAX_COMIC_WORKER_IMAGE_PIXELS } from './comicWorkerProtocol';

/** Deterministic local image operations used by comic cleanup and export. */
export const COMIC_IMAGE_PIPELINE_VERSION = 1 as const;
export const MAX_COMIC_CLEANUP_PIXELS = 20_000_000;
export const MAX_COMIC_MASK_OPERATIONS = 20_000;
export const MAX_COMIC_MASK_STROKE_POINTS = 512;
export const MAX_COMIC_MASK_RADIUS = 128;
export const MAX_COMIC_INPAINT_RADIUS = 32;

export type ComicMaskOperationKind = 'paint' | 'erase' | 'restore';

export interface ComicMaskPoint {
  x: number;
  y: number;
}

export interface ComicMaskStroke {
  kind: ComicMaskOperationKind;
  points: ComicMaskPoint[];
  radius: number;
  opacity?: number;
}

export interface ComicMaskSnapshot {
  version: typeof COMIC_IMAGE_PIPELINE_VERSION;
  width: number;
  height: number;
  operations: ComicMaskStroke[];
}

export interface ComicRgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface ComicCleanupOptions {
  mode?: 'deterministic' | 'inpaint';
  expandRadius?: number;
  featherRadius?: number;
  inpaintRadius?: number;
  signal?: AbortSignal;
}

export interface ComicInpaintRequest {
  image: ComicRgbaImage;
  mask: Uint8Array;
  signal: AbortSignal;
  reportProgress: (progress: number) => void;
}

export interface ComicInpaintWorker {
  process(request: ComicInpaintRequest): Promise<ComicRgbaImage>;
}

export interface ComicCleanupResult {
  image: ComicRgbaImage;
  mask: Uint8Array;
  mode: 'deterministic' | 'inpaint';
  changedPixels: number;
  warnings: string[];
}

export class ComicImagePipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComicImagePipelineError';
  }
}

const pixelCount = (width: number, height: number): number => {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new ComicImagePipelineError('Comic image dimensions are invalid');
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > MAX_COMIC_WORKER_IMAGE_PIXELS) {
    throw new ComicImagePipelineError('Comic image exceeds the pixel limit');
  }
  return pixels;
};

const ensureCleanupSize = (width: number, height: number): number => {
  const pixels = pixelCount(width, height);
  if (pixels > MAX_COMIC_CLEANUP_PIXELS) {
    throw new ComicImagePipelineError(
      `Comic cleanup exceeds the bounded pixel limit (${MAX_COMIC_CLEANUP_PIXELS})`,
    );
  }
  return pixels;
};

const finiteNumber = (value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ComicImagePipelineError(`Invalid comic image value: ${field}`);
  }
  return value;
};

const integer = (value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isInteger(value))
    throw new ComicImagePipelineError(`Invalid comic image value: ${field}`);
  return finiteNumber(value, field, min, max);
};

export const validateComicRgbaImage = (image: ComicRgbaImage): ComicRgbaImage => {
  const pixels = pixelCount(image.width, image.height);
  if (!(image.data instanceof Uint8Array) || image.data.byteLength !== pixels * 4) {
    throw new ComicImagePipelineError('Comic RGBA image data length does not match dimensions');
  }
  return image;
};

export const cloneComicRgbaImage = (image: ComicRgbaImage): ComicRgbaImage => {
  validateComicRgbaImage(image);
  return { width: image.width, height: image.height, data: image.data.slice() };
};

export const validateComicMask = (mask: Uint8Array, width: number, height: number): Uint8Array => {
  const pixels = pixelCount(width, height);
  if (!(mask instanceof Uint8Array) || mask.byteLength !== pixels) {
    throw new ComicImagePipelineError('Comic mask data length does not match dimensions');
  }
  return mask;
};

export const createEmptyComicMask = (width: number, height: number): Uint8Array => {
  pixelCount(width, height);
  return new Uint8Array(width * height);
};

const normalizePoint = (point: ComicMaskPoint, width: number, height: number): ComicMaskPoint => ({
  x: finiteNumber(point.x, 'mask point x', 0, width - 1),
  y: finiteNumber(point.y, 'mask point y', 0, height - 1),
});

export const parseComicMaskSnapshot = (value: unknown): ComicMaskSnapshot => {
  if (typeof value !== 'object' || value === null) {
    throw new ComicImagePipelineError('Invalid comic mask snapshot');
  }
  const raw = value as Record<string, unknown>;
  if (raw['version'] !== COMIC_IMAGE_PIPELINE_VERSION) {
    throw new ComicImagePipelineError('Unsupported comic mask snapshot version');
  }
  const width = integer(raw['width'], 'mask width', 1);
  const height = integer(raw['height'], 'mask height', 1);
  pixelCount(width, height);
  const operations = raw['operations'];
  if (!Array.isArray(operations) || operations.length > MAX_COMIC_MASK_OPERATIONS) {
    throw new ComicImagePipelineError('Invalid comic mask operations');
  }
  return {
    version: COMIC_IMAGE_PIPELINE_VERSION,
    width,
    height,
    operations: operations.map((entry, index) => {
      if (typeof entry !== 'object' || entry === null) {
        throw new ComicImagePipelineError(`Invalid comic mask operation: ${index}`);
      }
      const operation = entry as Record<string, unknown>;
      const kind = operation['kind'];
      if (kind !== 'paint' && kind !== 'erase' && kind !== 'restore') {
        throw new ComicImagePipelineError(`Invalid comic mask operation kind: ${index}`);
      }
      const points = operation['points'];
      if (
        !Array.isArray(points) ||
        points.length === 0 ||
        points.length > MAX_COMIC_MASK_STROKE_POINTS
      ) {
        throw new ComicImagePipelineError(`Invalid comic mask operation points: ${index}`);
      }
      const radius = finiteNumber(
        operation['radius'],
        `mask operation radius ${index}`,
        0.5,
        MAX_COMIC_MASK_RADIUS,
      );
      const opacity =
        operation['opacity'] === undefined
          ? undefined
          : integer(operation['opacity'], `mask operation opacity ${index}`, 1, 255);
      return {
        kind,
        points: points.map((point, pointIndex) => {
          if (typeof point !== 'object' || point === null) {
            throw new ComicImagePipelineError(`Invalid comic mask point: ${index}/${pointIndex}`);
          }
          const rawPoint = point as Record<string, unknown>;
          return normalizePoint(
            { x: rawPoint['x'] as number, y: rawPoint['y'] as number },
            width,
            height,
          );
        }),
        radius,
        ...(opacity === undefined ? {} : { opacity }),
      } satisfies ComicMaskStroke;
    }),
  };
};

const paintCircle = (
  mask: Uint8Array,
  width: number,
  height: number,
  center: ComicMaskPoint,
  radius: number,
  value: number,
): void => {
  const left = Math.max(0, Math.floor(center.x - radius));
  const right = Math.min(width - 1, Math.ceil(center.x + radius));
  const top = Math.max(0, Math.floor(center.y - radius));
  const bottom = Math.min(height - 1, Math.ceil(center.y + radius));
  const radiusSquared = radius * radius;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const dx = x - center.x;
      const dy = y - center.y;
      if (dx * dx + dy * dy <= radiusSquared) {
        const index = y * width + x;
        if (value > mask[index]!) mask[index] = value;
        else if (value === 0) mask[index] = 0;
      }
    }
  }
};

const drawStroke = (
  mask: Uint8Array,
  width: number,
  height: number,
  stroke: ComicMaskStroke,
): void => {
  const value = stroke.kind === 'paint' ? (stroke.opacity ?? 255) : 0;
  const points = stroke.points;
  const drawPoint = (point: ComicMaskPoint) =>
    paintCircle(mask, width, height, point, stroke.radius, value);
  if (points.length === 1) {
    drawPoint(points[0]!);
    return;
  }
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, stroke.radius / 2)));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      drawPoint({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t });
    }
  }
};

export const rasterizeComicMask = (snapshot: ComicMaskSnapshot): Uint8Array => {
  const parsed = parseComicMaskSnapshot(snapshot);
  const mask = createEmptyComicMask(parsed.width, parsed.height);
  for (const operation of parsed.operations) {
    drawStroke(mask, parsed.width, parsed.height, operation);
  }
  return mask;
};

const assertRadius = (radius: number, field: string, maximum = MAX_COMIC_MASK_RADIUS): number =>
  integer(radius, field, 0, maximum);

/** Expand a mask using a separable max filter with bounded memory. */
export const expandComicMask = (
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array => {
  validateComicMask(mask, width, height);
  const r = assertRadius(radius, 'mask expand radius');
  if (r === 0) return mask.slice();
  const horizontal = new Uint8Array(mask.length);
  const expanded = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 0;
      for (let dx = -r; dx <= r; dx += 1) {
        const candidate = x + dx;
        if (candidate >= 0 && candidate < width)
          value = Math.max(value, mask[y * width + candidate]!);
      }
      horizontal[y * width + x] = value;
    }
  }
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let value = 0;
      for (let dy = -r; dy <= r; dy += 1) {
        const candidate = y + dy;
        if (candidate >= 0 && candidate < height)
          value = Math.max(value, horizontal[candidate * width + x]!);
      }
      expanded[y * width + x] = value;
    }
  }
  return expanded;
};

/** Feather a mask using a bounded separable box average. */
export const featherComicMask = (
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array => {
  validateComicMask(mask, width, height);
  const r = assertRadius(radius, 'mask feather radius', 32);
  if (r === 0) return mask.slice();
  const horizontal = new Uint32Array(mask.length);
  const feathered = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    const prefix = new Uint32Array(width + 1);
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      prefix[x + 1] = prefix[x]! + mask[rowOffset + x]!;
    }
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - r);
      const right = Math.min(width - 1, x + r);
      horizontal[rowOffset + x] = prefix[right + 1]! - prefix[left]!;
    }
  }
  for (let x = 0; x < width; x += 1) {
    const prefix = new Uint32Array(height + 1);
    for (let y = 0; y < height; y += 1) {
      prefix[y + 1] = prefix[y]! + horizontal[y * width + x]!;
    }
    for (let y = 0; y < height; y += 1) {
      const top = Math.max(0, y - r);
      const bottom = Math.min(height - 1, y + r);
      const area = (bottom - top + 1) * (Math.min(width - 1, x + r) - Math.max(0, x - r) + 1);
      const sum = prefix[bottom + 1]! - prefix[top]!;
      feathered[y * width + x] = Math.round(sum / area);
    }
  }
  return feathered;
};

const checkCancelled = (signal: AbortSignal): void => {
  if (signal.aborted) throw new ComicImagePipelineError('Comic image processing cancelled');
};

const deterministicFill = (
  image: ComicRgbaImage,
  mask: Uint8Array,
  radius: number,
  signal: AbortSignal,
): { image: ComicRgbaImage; changedPixels: number } => {
  const output = cloneComicRgbaImage(image);
  let changedPixels = 0;
  for (let y = 0; y < image.height; y += 1) {
    if (y % 16 === 0) checkCancelled(signal);
    for (let x = 0; x < image.width; x += 1) {
      const maskValue = mask[y * image.width + x]!;
      if (maskValue === 0) continue;
      const samples: number[] = [];
      for (let distance = 1; distance <= radius && samples.length < 12; distance += 1) {
        const candidates = [
          [x - distance, y],
          [x + distance, y],
          [x, y - distance],
          [x, y + distance],
        ] as const;
        for (const [candidateX, candidateY] of candidates) {
          if (
            candidateX < 0 ||
            candidateY < 0 ||
            candidateX >= image.width ||
            candidateY >= image.height
          ) {
            continue;
          }
          if (mask[candidateY * image.width + candidateX] === 0) {
            samples.push(candidateY * image.width + candidateX);
            if (samples.length >= 12) break;
          }
        }
      }
      if (samples.length === 0) continue;
      const target = (y * image.width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const average =
          samples.reduce((sum, sample) => sum + image.data[sample * 4 + channel]!, 0) /
          samples.length;
        const original = image.data[target + channel]!;
        output.data[target + channel] = Math.round(
          original * (1 - maskValue / 255) + average * (maskValue / 255),
        );
      }
      changedPixels += 1;
    }
  }
  return { image: output, changedPixels };
};

export const cleanupComicImage = async (
  image: ComicRgbaImage,
  mask: Uint8Array,
  options: ComicCleanupOptions = {},
  worker?: ComicInpaintWorker,
): Promise<ComicCleanupResult> => {
  validateComicRgbaImage(image);
  ensureCleanupSize(image.width, image.height);
  validateComicMask(mask, image.width, image.height);
  const signal = options.signal ?? new AbortController().signal;
  checkCancelled(signal);
  const expanded = expandComicMask(mask, image.width, image.height, options.expandRadius ?? 0);
  const processedMask = featherComicMask(
    expanded,
    image.width,
    image.height,
    options.featherRadius ?? 0,
  );
  const mode = options.mode ?? 'deterministic';
  if (mode === 'inpaint') {
    if (!worker) throw new ComicImagePipelineError('A local inpainting worker is required');
    const output = await worker.process({
      image: cloneComicRgbaImage(image),
      mask: processedMask.slice(),
      signal,
      reportProgress: () => {},
    });
    checkCancelled(signal);
    validateComicRgbaImage(output);
    if (output.width !== image.width || output.height !== image.height) {
      throw new ComicImagePipelineError('Inpainting worker changed image dimensions');
    }
    return {
      image: cloneComicRgbaImage(output),
      mask: processedMask,
      mode,
      changedPixels: processedMask.reduce((count, value) => count + (value > 0 ? 1 : 0), 0),
      warnings: [],
    };
  }
  const filled = deterministicFill(
    image,
    processedMask,
    Math.max(1, Math.min(MAX_COMIC_INPAINT_RADIUS, options.inpaintRadius ?? 8)),
    signal,
  );
  return {
    image: filled.image,
    mask: processedMask,
    mode,
    changedPixels: filled.changedPixels,
    warnings: filled.changedPixels === 0 ? ['The mask did not touch a fillable pixel.'] : [],
  };
};
