import { beforeEach, describe, expect, test, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { impactFeedback } from '@/utils/haptics';

describe('impactFeedback', () => {
  beforeEach(() => invoke.mockClear());

  test('invokes the native haptics command without loading the generated guest package', async () => {
    await impactFeedback('medium');
    expect(invoke).toHaveBeenCalledWith('plugin:haptics|impact_feedback', {
      style: 'medium',
    });
  });
});
