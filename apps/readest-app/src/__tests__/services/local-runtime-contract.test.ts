import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const projectPath = (path: string) => resolve(process.cwd(), path);
const readSource = (path: string) => readFileSync(projectPath(path), 'utf8');

describe('BabelLeaf local runtime contract', () => {
  test('does not initialize telemetry or account and cloud sync providers', () => {
    const providers = readSource('src/components/Providers.tsx');
    const environment = readSource('src/context/EnvContext.tsx');

    for (const forbidden of [
      'posthog-js',
      'CSPostHogProvider',
      'TelemetryConsentDialog',
      'AuthProvider',
      'SyncProvider',
      'initSettingsSync',
    ]) {
      expect(providers).not.toContain(forbidden);
    }
    expect(environment).not.toContain('@/services/sync/');
  });

  test('does not ship hosted-service dependencies in the native application', () => {
    const appPackage = JSON.parse(readSource('package.json')) as {
      dependencies: Record<string, string>;
    };

    for (const dependency of [
      '@opennextjs/cloudflare',
      '@sentry/cli',
      '@stripe/react-stripe-js',
      '@stripe/stripe-js',
      '@supabase/auth-ui-react',
      '@supabase/auth-ui-shared',
      '@supabase/supabase-js',
      'posthog-js',
      'stripe',
    ]) {
      expect(appPackage.dependencies).not.toHaveProperty(dependency);
    }
  });

  test('does not retain hosted API, browser extension, or cloud worker projects', () => {
    for (const path of [
      'src/app/api',
      'src/pages/api',
      'extensions/send-to-readest',
      'workers/iap-reconcile',
      'workers/send-email',
    ]) {
      expect(existsSync(projectPath(path)), `${path} should be removed`).toBe(false);
    }
  });
});
