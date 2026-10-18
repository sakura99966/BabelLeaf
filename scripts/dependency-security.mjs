import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** A code backport is not a clean version scan. Unknown findings fail closed. */
export function assessDependencyAudit(report, policies = []) {
  if (!report || typeof report !== 'object' || report.error || !report.metadata?.vulnerabilities ||
    !report.advisories || typeof report.advisories !== 'object') {
    throw new Error('Incomplete or unavailable dependency audit');
  }
  const findings = Object.values(report.advisories);
  if (!findings.length && Object.values(report.metadata.vulnerabilities).some((count) => Number(count) > 0)) {
    throw new Error('Audit counts have no corresponding advisory records');
  }
  const mitigated = [];
  const unresolved = [];
  for (const advisory of findings) {
    const id = advisory.url?.match(/^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9-]+)$/i)?.[1];
    const policy = policies.find((entry) => entry.name === advisory.module_name && entry.advisories.includes(id));
    const matches = policy && advisory.findings?.length && advisory.findings.every(
      (finding) => finding.dev === true && finding.version === policy.version,
    );
    const record = { package: advisory.module_name, id: id ?? String(advisory.id), title: advisory.title };
    (matches ? mitigated : unresolved).push(record);
  }
  return { passed: unresolved.length === 0, mitigated, unresolved };
}

export function verifyDependencyBackports(root, policies) {
  const lock = readFileSync(new URL('pnpm-lock.yaml', root), 'utf8');
  const workspace = readFileSync(new URL('pnpm-workspace.yaml', root), 'utf8');
  for (const policy of policies) {
    const actual = createHash('sha256').update(readFileSync(new URL(policy.patch, root))).digest('hex');
    if (actual !== policy.sha256) throw new Error('Unreviewed dependency patch: ' + policy.name);
    const spec = policy.name + '@' + policy.version;
    if (!lock.includes('  ' + spec + ': ' + actual) ||
      !workspace.includes('  ' + spec + ': ' + policy.patch)) {
      throw new Error('Dependency backport is not bound to the active lock: ' + spec);
    }
  }
}
