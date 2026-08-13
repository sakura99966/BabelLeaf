import { invoke } from '@tauri-apps/api/core';

export type ImpactFeedbackStyle = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid';

export const impactFeedback = (style: ImpactFeedbackStyle): Promise<void> =>
  invoke('plugin:haptics|impact_feedback', { style });
