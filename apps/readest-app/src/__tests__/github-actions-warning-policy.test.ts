import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '../../.github/workflows/pull-request.yml'),
  'utf8',
).replaceAll('\r\n', '\n');

function jobBlock(name: string): string {
  const marker = '  ' + name + ':\n';
  const start = workflow.indexOf(marker);
  if (start < 0) {
    throw new Error('Missing CI job: ' + name);
  }
  const remaining = workflow.slice(start + marker.length);
  const nextJob = remaining.search(/\n {2}[\w-]+:\n/);
  return nextJob < 0 ? remaining : remaining.slice(0, nextJob);
}

describe('GitHub Actions Rust warning policy', () => {
  it.each([
    'rust_lint',
    'build_tauri_app',
    'security_audit',
    'windows_installer_smoke',
    'windows_native_e2e',
  ])('%s explicitly keeps dependency warnings visible without a global build veto', (name) => {
    const job = jobBlock(name);
    const rustStep = job
      .split('\n      - ')
      .find((step) => step.includes('uses: actions-rust-lang/setup-rust-toolchain@'));
    expect(rustStep).toBeDefined();
    expect(rustStep).toMatch(/uses: actions-rust-lang\/setup-rust-toolchain@[a-f0-9]{40}\b/);
    expect(rustStep).toMatch(/^ {8}with:\n/m);
    expect(rustStep).toMatch(/^ {10}build-warnings: warn\s*$/m);
    expect(job).not.toMatch(/CARGO_BUILD_WARNINGS:\s*(deny|allow)\b/);
  });

  it('retains strict application Clippy and native unit-test gates', () => {
    const lintJob = jobBlock('rust_lint');
    expect(lintJob).toContain('run: cargo clippy -p Readest --no-deps -- -D warnings');
    expect(lintJob).toContain('run: cargo test -p Readest --lib');
    expect(lintJob).not.toContain('continue-on-error: true');
    const required = jobBlock('ci_gate');
    expect(required).toContain('name: required-checks');
    expect(required).toContain('rust_lint');
    expect(required).toContain('build_tauri_app');
  });
});
