import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assessDependencyAudit, verifyDependencyBackports } from './dependency-security.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(readFileSync(resolve(root, 'scripts/dependency-security-policy.json'), 'utf8'));
verifyDependencyBackports(pathToFileURL(root + '/'), policy.packages);
const entrypoint = process.env.npm_execpath;
const runPnpm = (args) => {
  try {
    return {
      status: 0,
      stdout: entrypoint && existsSync(entrypoint)
        ? execFileSync(process.execPath, [entrypoint, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
        : execFileSync(process.execPath, [resolve(root, 'scripts/pnpm-runner.mjs'), ...args], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }),
    };
  } catch (error) {
    return { status: error.status ?? 2, stdout: error.stdout?.toString() ?? '', stderr: error.stderr?.toString() ?? error.message };
  }
};
const regression = runPnpm([
  '--filter', '@readest/readest-app', 'exec', 'vitest', 'run',
  'src/__tests__/scripts/dependency-security-patches.test.ts',
  'src/__tests__/scripts/dependency-security-policy.test.ts',
]);
if (regression.status !== 0) throw new Error('Installed dependency backport regressions failed: ' + regression.stdout);
const production = runPnpm(['audit', '--prod', '--json']);
const full = runPnpm(['audit', '--json']);
const parse = (result) => {
  if (![0, 1].includes(result.status)) throw new Error('Dependency audit unavailable: ' + result.stderr);
  return JSON.parse(result.stdout);
};
const productionResult = assessDependencyAudit(parse(production), []);
const fullResult = assessDependencyAudit(parse(full), policy.packages);
const passed = productionResult.passed && fullResult.passed;
const evidence = {
  status: passed ? (fullResult.mitigated.length ? 'PASS_WITH_PINNED_DEVELOPMENT_BACKPORTS' : 'PASS_CLEAN') : 'FAIL',
  observedAt: new Date().toISOString(),
  production: productionResult,
  full: fullResult,
  regressionExit: regression.status,
  policy,
  note: 'Raw version advisories remain visible. Only tested, hash-bound, exact-version development backports qualify; new/runtime/unknown findings fail.',
};
const outputFlag = process.argv.indexOf('--output');
const output = resolve(root, outputFlag >= 0 ? process.argv[outputFlag + 1] : 'target/babelleaf-compliance/dependency-security.json');
const outputRelative = relative(resolve(root, 'target'), output);
if (!outputRelative || outputRelative.startsWith('..') || !output.endsWith('.json')) throw new Error('Security report must be a target/ JSON file');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
console.log('[BabelLeaf] ' + evidence.status + '; production unresolved=' + productionResult.unresolved.length +
  '; full unresolved=' + fullResult.unresolved.length + '; reviewed code backports=' + fullResult.mitigated.length);
if (!passed) process.exitCode = 1;
