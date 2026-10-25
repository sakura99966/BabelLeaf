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

  it('starts the Linux session bus inside a stable software-rendered Xvfb display', () => {
    const native = jobBlock('build_tauri_app');
    expect(native).toContain('runs-on: ubuntu-24.04');
    expect(native).toContain("GDK_BACKEND: 'x11'");
    expect(native).toContain("LIBGL_ALWAYS_SOFTWARE: '1'");
    expect(native).toContain("WEBKIT_DISABLE_DMABUF_RENDERER: '1'");
    expect(native).toContain("WEBKIT_DISABLE_COMPOSITING_MODE: '1'");
    expect(native).toContain('xvfb-run -a --server-args="-screen 0 1280x720x24" dbus-run-session');
    expect(native).not.toContain('xvfb-run pnpm test:tauri');
    expect(native).not.toContain('WEBKIT_FORCE_SANDBOX');
    expect(native).toContain('pnpm test:tauri');
  });

  it.each([
    'rust_lint',
    'build_tauri_app',
  ])('%s installs system packages without archiving root-owned APT state', (name) => {
    const job = jobBlock(name);
    expect(job).not.toContain('/var/cache/apt/archives');
    expect(job).not.toContain('name: cache apt packages');
    expect(job).toContain('name: install system dependencies');
    expect(job).toContain('sudo apt-get update');
    expect(job).toContain('sudo apt-get install -y');
    expect(job).not.toMatch(/if:.*cache.*(?:hit|miss)/i);
  });
});
