import { describe, it, expect } from 'vitest';
import { getTauri, invoke } from './tauri-invoke';

describe('Tauri Smoke Tests', () => {
  it('should have __TAURI_INTERNALS__ available via window.top', () => {
    const tauri = getTauri();
    expect(tauri).toBeDefined();
    expect(typeof tauri.invoke).toBe('function');
  });

  it('should invoke get_executable_dir', async () => {
    const execDir = (await invoke('get_executable_dir')) as string;
    expect(typeof execDir).toBe('string');
    expect(execDir.length).toBeGreaterThan(0);
  });

  it('should get executable dir that contains the app name', async () => {
    const execDir = (await invoke('get_executable_dir')) as string;
    expect(execDir.toLowerCase()).toMatch(/babelleaf|target/);
  });

  it('round-trips and clears a synthetic secure credential without exposing it', async () => {
    const key = `babelleaf-acceptance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const value = `synthetic-secret-${Date.now()}`;
    try {
      const saved = (await invoke('plugin:native-bridge|set_secure_item', {
        payload: { key, value },
      })) as { success?: boolean; error?: string };
      expect(saved.success, saved.error).toBe(true);

      const loaded = (await invoke('plugin:native-bridge|get_secure_item', {
        payload: { key },
      })) as { value?: string; error?: string };
      expect(loaded.error == null).toBe(true);
      expect(loaded.value).toBe(value);

      expect(JSON.stringify(saved)).not.toContain(value);
    } finally {
      const cleared = (await invoke('plugin:native-bridge|clear_secure_item', {
        payload: { key },
      })) as { success?: boolean; error?: string };
      expect(cleared.success, cleared.error).toBe(true);
      const afterClear = (await invoke('plugin:native-bridge|get_secure_item', {
        payload: { key },
      })) as { value?: string; error?: string };
      expect(afterClear.error == null).toBe(true);
      expect(afterClear.value == null).toBe(true);
    }
  });
});
