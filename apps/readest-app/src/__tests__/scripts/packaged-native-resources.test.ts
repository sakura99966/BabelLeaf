import { expect, test } from 'vitest';
import { summarizePackagedResources } from '../../../scripts/packaged-native-resources.mjs';
import { ownedWindowsProcessCommand } from '../../../scripts/owned-windows-processes.mjs';

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

const ownedIdentity = {
  ProcessId: 123,
  CreationKey: '2026-01-01T00:00:00.000000Z',
  ExecutablePath: "C:\\合成样本\\it's\\BabelLeaf.exe",
};
test('pins executable, creation time and UTF-8 output without shell interpolation', () => {
  const command = ownedWindowsProcessCommand(
    ownedIdentity,
    'Get-BabelLeafOwnedProcesses -Identity $identity',
  );
  expect(command).toContain('UTF8Encoding');
  expect(command).toContain("CreationKey='2026-01-01T00:00:00.000000Z'");
  expect(command).toContain("ExecutablePath='C:\\合成样本\\it''s\\BabelLeaf.exe'");
  expect(command).not.toContain('taskkill');
});
test.each([
  { ...ownedIdentity, ProcessId: 0 },
  { ...ownedIdentity, ProcessId: Number.NaN },
  { ...ownedIdentity, CreationKey: 'unknown' },
  { ...ownedIdentity, ExecutablePath: 'relative.exe' },
  { ...ownedIdentity, ExecutablePath: 'C:\\bad\npath.exe' },
])('rejects incomplete or unsafe owned-process identities', (identity) => {
  expect(() => ownedWindowsProcessCommand(identity, '')).toThrow();
});
