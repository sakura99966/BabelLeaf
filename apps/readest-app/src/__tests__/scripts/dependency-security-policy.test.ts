import { expect, it } from 'vitest';
import { assessDependencyAudit } from '../../../../../scripts/dependency-security.mjs';

const policy = [
  {
    name: 'reviewed',
    version: '1.0.0',
    advisories: ['GHSA-aaaa-bbbb-cccc'],
  },
];
const report = (id = 'GHSA-aaaa-bbbb-cccc', dev = true, version = '1.0.0') => ({
  metadata: { vulnerabilities: { high: 1 } },
  advisories: {
    one: {
      module_name: 'reviewed',
      url: 'https://github.com/advisories/' + id,
      findings: [{ version, dev }],
    },
  },
});
it('distinguishes a reviewed code mitigation from a clean scan', () => {
  const result = assessDependencyAudit(report(), policy);
  expect(result.passed).toBe(true);
  expect(result.mitigated).toHaveLength(1);
});

it('does not apply a development-only backport disposition to a copied runtime package', () => {
  expect(assessDependencyAudit(report(), policy, ['reviewed']).passed).toBe(false);
});
it.each([
  report('GHSA-new1-new2-new3'),
  report(undefined, false),
  report(undefined, true, '1.0.1'),
])('does not exempt unknown advisories, runtime copies or different versions', (input) => {
  expect(assessDependencyAudit(input, policy).passed).toBe(false);
});
it.each([
  {},
  { error: 'network failure' },
  { metadata: { vulnerabilities: { high: 1 } }, advisories: {} },
])('fails closed on incomplete audit evidence', (input) =>
  expect(() => assessDependencyAudit(input, policy)).toThrow());
