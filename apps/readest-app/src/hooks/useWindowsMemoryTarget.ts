import { useEffect } from 'react';

// WebView2 applies the low-memory target asynchronously. Request it soon after
// a foreground window becomes input-idle so the working set can settle before
// long reading pauses, while every interaction below restores Normal first.
export const WINDOWS_IDLE_MEMORY_DELAY_MS = 10_000;

const requestMemoryTarget = async (low: boolean): Promise<void> => {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_webview_memory_usage', { low });
  } catch (error) {
    // The API is best-effort and absent on WebView2 runtimes older than 114.
    // A failure must not interfere with input handling or application startup.
    console.warn('Unable to update the WebView2 memory target:', error);
  }
};

/**
 * Put WebView2 into its supported low-memory target while the Windows app is
 * inactive, and restore normal memory before processing the next interaction.
 * Scripts and network connections remain active; this does not suspend the
 * reader or terminate any WebView2 sandbox process.
 */
export const useWindowsMemoryTarget = (enabled: boolean): void => {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let low = false;
    let disposed = false;

    const setLow = (nextLow: boolean) => {
      if (disposed || low === nextLow) return;
      low = nextLow;
      void requestMemoryTarget(nextLow);
    };

    const clearIdleTimer = () => {
      if (idleTimer !== undefined) {
        clearTimeout(idleTimer);
        idleTimer = undefined;
      }
    };

    const scheduleIdleTarget = () => {
      clearIdleTimer();
      if (document.hidden || !document.hasFocus()) {
        setLow(true);
        return;
      }
      idleTimer = setTimeout(() => {
        idleTimer = undefined;
        setLow(true);
      }, WINDOWS_IDLE_MEMORY_DELAY_MS);
    };

    const handleActivity = () => {
      setLow(false);
      scheduleIdleTarget();
    };

    const handleVisibility = () => {
      if (document.hidden) {
        clearIdleTimer();
        setLow(true);
      } else {
        handleActivity();
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'focus',
      'pointerdown',
      'pointermove',
      'keydown',
      'wheel',
      'touchstart',
    ];
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }
    window.addEventListener('blur', scheduleIdleTarget);
    document.addEventListener('visibilitychange', handleVisibility);
    scheduleIdleTarget();

    return () => {
      clearIdleTimer();
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, handleActivity);
      }
      window.removeEventListener('blur', scheduleIdleTarget);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (low) void requestMemoryTarget(false);
      disposed = true;
    };
  }, [enabled]);
};
