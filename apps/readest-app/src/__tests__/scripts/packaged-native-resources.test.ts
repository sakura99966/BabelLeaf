import { expect, test } from 'vitest';
import { summarizePackagedResources } from '../../../scripts/packaged-native-resources.mjs';

const sample = (workingSetBytes: number, privateBytes: number) => ({
  timestampMs: 1000,
  processes: 3,
  workingSetBytes,
  privateBytes,
});
test('compares sampled owned-process memory with the approved 1 GiB active-workload budget', () => {
  expect(summarizePackagedResources([sample(1024, 2048), sample(4096, 3072)])).toMatchObject({
    passed: true,
    peakWorkingSetBytes: 4096,
    peakPrivateBytes: 3072,
    budgetBytes: 1024 ** 3,
    samples: 2,
  });
  expect(summarizePackagedResources([sample(1024 ** 3 + 1, 2048)]).passed).toBe(false);
});
test.each([
  { samples: [] },
  { samples: [sample(-1, 2)] },
  { samples: [sample(2, Number.NaN)] },
  { samples: [{ ...sample(1, 2), processes: 0 }] },
  { samples: [{ ...sample(1, 2), timestampMs: Number.POSITIVE_INFINITY }] },
])('rejects missing or invalid native measurement rather than recording a pass', ({ samples }) => {
  expect(() => summarizePackagedResources(samples)).toThrow();
});
