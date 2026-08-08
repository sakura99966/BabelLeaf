import type { OcrModelRuntime } from './ocrModels';

export type OcrCandidateStatus = 'research' | 'adapter-ready' | 'approved';

export interface OcrCandidateRecord {
  id: string;
  upstream: string;
  license: string;
  runtime: OcrModelRuntime;
  languages: string[];
  status: OcrCandidateStatus;
  modelProvenanceRequired: boolean;
  note: string;
}

/**
 * Candidate metadata is deliberately descriptive, not an installation list.
 * A candidate must still provide a local model pack and measured gate evidence
 * before it can be selected by the reader.
 */
export const OCR_CANDIDATE_REGISTRY: readonly OcrCandidateRecord[] = [
  {
    id: 'paddleocr-onnx',
    upstream: 'https://github.com/PaddlePaddle/PaddleOCR',
    license: 'Apache-2.0',
    runtime: 'onnx',
    languages: ['zh', 'en', 'ja'],
    status: 'research',
    modelProvenanceRequired: true,
    note: 'Multilingual detection and recognition candidate; model and preprocessing must be pinned separately.',
  },
  {
    id: 'manga-ocr-rs',
    upstream: 'https://github.com/CodeMonkeyNinja/manga-ocr-rs',
    license: 'MIT',
    runtime: 'onnx',
    languages: ['ja'],
    status: 'adapter-ready',
    modelProvenanceRequired: true,
    note: 'Experimental Rust/ONNX Japanese manga path; encoder, decoder, vocabulary, and model licenses require a bundle review.',
  },
] as const;

const cloneCandidate = (candidate: OcrCandidateRecord): OcrCandidateRecord => ({
  ...candidate,
  languages: [...candidate.languages],
});

export const listOcrCandidates = (): OcrCandidateRecord[] =>
  OCR_CANDIDATE_REGISTRY.map(cloneCandidate);

export const findOcrCandidate = (id: string): OcrCandidateRecord | null => {
  const candidate = OCR_CANDIDATE_REGISTRY.find((item) => item.id === id);
  return candidate ? cloneCandidate(candidate) : null;
};
