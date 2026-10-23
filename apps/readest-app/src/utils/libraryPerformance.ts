/** Bounded, local-only readiness evidence. Nothing is uploaded or persisted. */
export const LIBRARY_INTERACTIVE_MARK = 'babelleaf:library-interactive';

interface ReadinessEnvironment {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (id: number) => void;
  performance: Pick<Performance, 'getEntriesByName' | 'mark'>;
}

export function scheduleLibraryInteractiveMark(
  browser: ReadinessEnvironment | null = typeof window === 'undefined' ? null : window,
): () => void {
  let pending: number | undefined;
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    if (pending !== undefined) browser?.cancelAnimationFrame(pending);
    pending = undefined;
  };
  if (!browser) return cancel;
  try {
    if (browser.performance.getEntriesByName(LIBRARY_INTERACTIVE_MARK).length) return cancel;
    pending = browser.requestAnimationFrame(() => {
      pending = undefined;
      if (cancelled) return;
      try {
        // The committed interactive UI has had one paint opportunity by the
        // second frame. This is not a Win32 window-ready or network metric.
        pending = browser.requestAnimationFrame(() => {
          pending = undefined;
          if (cancelled) return;
          try {
            if (!browser.performance.getEntriesByName(LIBRARY_INTERACTIVE_MARK).length)
              browser.performance.mark(LIBRARY_INTERACTIVE_MARK);
          } catch {
            /* Optional diagnostics must never break the library. */
          }
        });
      } catch {
        /* Optional diagnostics must never break the library. */
      }
    });
  } catch {
    /* Unsupported performance APIs are not reader failures. */
  }
  return cancel;
}
