import { describe, expect, test } from 'vitest';
import { NETWORK_CAPABILITIES, isNetworkCapabilityAllowed } from '@/services/productPolicy';

describe('BabelLeaf product network policy', () => {
  test('allows only user-configured LLM translation traffic', () => {
    const allowedCapabilities = Object.entries(NETWORK_CAPABILITIES)
      .filter(([, allowed]) => allowed)
      .map(([capability]) => capability);

    expect(allowedCapabilities).toEqual(['llmTranslation']);
    expect(isNetworkCapabilityAllowed('llmTranslation')).toBe(true);
  });

  test.each([
    'account',
    'cloudSync',
    'opds',
    'rss',
    'sendToDevice',
    'publicShare',
    'onlineMetadata',
    'onlineDictionary',
    'onlineTts',
    'remoteAssets',
    'telemetry',
    'updater',
    'billing',
  ] as const)('blocks %s traffic', (capability) => {
    expect(isNetworkCapabilityAllowed(capability)).toBe(false);
  });
});
