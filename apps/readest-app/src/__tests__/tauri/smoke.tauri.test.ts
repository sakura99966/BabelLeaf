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
});
