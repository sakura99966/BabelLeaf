import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const posthogMocks = vi.hoisted(() => ({
  init: vi.fn(),
  registerForSession: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: {
    init: posthogMocks.init,
    register_for_session: posthogMocks.registerForSession,
  },
}));

vi.mock('posthog-js/react', () => ({
  PostHogProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/utils/version', () => ({
  getAppVersion: () => 'test-version',
}));

import { CSPostHogProvider } from '@/context/PHContext';

describe('CSPostHogProvider network policy', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test('renders children without starting a telemetry session', () => {
    render(
      <CSPostHogProvider>
        <div>local content</div>
      </CSPostHogProvider>,
    );

    expect(screen.getByText('local content')).toBeTruthy();
    expect(posthogMocks.init).not.toHaveBeenCalled();
    expect(posthogMocks.registerForSession).not.toHaveBeenCalled();
  });
});
