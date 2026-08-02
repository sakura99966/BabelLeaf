import { TTSGranularity, TTSVoice, TTSVoicesGroup } from './types';

type TTSMessageCode = 'boundary' | 'error' | 'end';

export interface TTSMessageEvent {
  code: TTSMessageCode;
  message?: string;
  mark?: string;
}

// What the active engine can actually do, so the controller and UI degrade
// uniformly instead of probing per-feature or comparing client identities.
export interface TTSCapabilities {
  // Reports word-boundary timings during playback: the controller highlights
  // word-by-word and suppresses the sentence highlight.
  wordBoundaries: boolean;
  // Audio is rendered through a clock owned by the application.
  mediaClock: boolean;
}

export interface TTSClient {
  name: string;
  initialized: boolean;
  init(): Promise<boolean>;
  shutdown(): Promise<void>;
  speak(ssml: string, signal: AbortSignal): AsyncIterable<TTSMessageEvent>;
  pause(): Promise<boolean>;
  resume(): Promise<boolean>;
  stop(): Promise<void>;
  setPrimaryLang(lang: string): void;
  setRate(rate: number): Promise<void>;
  setPitch(pitch: number): Promise<void>;
  setVoice(voice: string): Promise<void>;
  getAllVoices(): Promise<TTSVoice[]>;
  getVoices(lang: string): Promise<TTSVoicesGroup[]>;
  getGranularities(): TTSGranularity[];
  getCapabilities(): TTSCapabilities;
  getVoiceId(): string;
  getSpeakingLang(): string;
}
