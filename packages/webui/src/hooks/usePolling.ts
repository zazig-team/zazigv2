import { useEffect, useRef } from "react";

/**
 * Calls `callback` on a fixed interval while `enabled` is true.
 * Skips overlapping invocations — if the previous call is still
 * in-flight the interval tick is silently dropped.
 */
export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let running = false;

    const id = window.setInterval(() => {
      if (running) {
        return;
      }

      running = true;
      Promise.resolve(callbackRef.current())
        .catch(() => {
          // Silent failure for background polling.
        })
        .finally(() => {
          running = false;
        });
    }, intervalMs);

    return () => {
      window.clearInterval(id);
    };
  }, [intervalMs, enabled]);
}
