import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getAppService } = vi.hoisted(() => {
  const appService = { isMobile: false };
  return { getAppService: vi.fn(async () => appService) };
});

vi.mock('@/services/environment', () => ({
  default: { getAppService },
}));

import { EnvProvider, useEnv } from '@/context/EnvContext';

const Probe = () => {
  const { appService: service } = useEnv();
  return <div>{service ? 'ready' : 'loading'}</div>;
};

describe('EnvProvider local service initialization', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('initializes the local app service without starting a remote sync service', async () => {
    render(
      <EnvProvider>
        <Probe />
      </EnvProvider>,
    );

    await waitFor(() => expect(screen.getByText('ready')).toBeTruthy());
    expect(getAppService).toHaveBeenCalledOnce();
  });
});
