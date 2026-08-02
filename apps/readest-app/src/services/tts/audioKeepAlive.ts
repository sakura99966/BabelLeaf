// Android system TTS renders outside the WebView. A quiet oscillator keeps the
// WebView's timers active while the screen is locked so sentence auto-advance
// can continue. The context is created only for Android playback and reused.

let sharedContext: AudioContext | null = null;

const getSharedContext = (): AudioContext => {
  sharedContext ??= new AudioContext();
  return sharedContext;
};

export const ensureSharedAudioContext = async (): Promise<void> => {
  if (typeof AudioContext === 'undefined') return;
  try {
    const context = getSharedContext();
    if (context.state !== 'running') {
      await context.resume();
    }
  } catch (error) {
    console.warn('[TTS] audio context warmup failed', error);
  }
};

const KEEP_ALIVE_FREQ_HZ = 40;
const KEEP_ALIVE_GAIN = 0.0008;
let keepAliveOscillator: OscillatorNode | null = null;
let keepAliveGain: GainNode | null = null;

export const startAudioKeepAlive = (): void => {
  if (typeof AudioContext === 'undefined' || keepAliveOscillator) return;
  try {
    const context = getSharedContext();
    if (context.state !== 'running') void context.resume();
    const oscillator = context.createOscillator();
    oscillator.frequency.value = KEEP_ALIVE_FREQ_HZ;
    const gain = context.createGain();
    gain.gain.value = KEEP_ALIVE_GAIN;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    keepAliveOscillator = oscillator;
    keepAliveGain = gain;
  } catch (error) {
    console.warn('[TTS] audio keep-alive start failed', error);
  }
};

export const stopAudioKeepAlive = (): void => {
  if (!keepAliveOscillator && !keepAliveGain) return;
  try {
    keepAliveOscillator?.stop();
    keepAliveOscillator?.disconnect();
    keepAliveGain?.disconnect();
  } catch (error) {
    console.warn('[TTS] audio keep-alive stop failed', error);
  }
  keepAliveOscillator = null;
  keepAliveGain = null;
};
