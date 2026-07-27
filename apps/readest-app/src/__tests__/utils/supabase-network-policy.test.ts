import { describe, expect, test, vi } from 'vitest';

const createClientMock = vi.hoisted(() => vi.fn(() => ({ auth: {} })));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

vi.mock('@/services/runtimeConfig', () => ({
  getRuntimeConfig: () => ({
    supabaseUrl: 'https://supabase.example.test',
    supabaseAnonKey: 'test-anon-key',
  }),
}));

import '@/utils/supabase';

describe('Supabase product network policy', () => {
  test('constructs the shared client without session restoration or refresh', () => {
    expect(createClientMock).toHaveBeenCalledWith(
      'https://supabase.example.test',
      'test-anon-key',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          skipAutoInitialize: true,
        },
      },
    );
  });
});
