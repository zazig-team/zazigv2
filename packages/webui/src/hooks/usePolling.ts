import { useEffect, useRef } from "react";

/**
 * Calls `callback` every `intervalMs` while `enabled` is true.
 * Fires immediately on first enable, then repeats on the interval.
 */
export function usePolling(
  callback: () => void,
  intervalMs: number,
  enabled: boolean,
): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    savedCallback.current();

    const id = setInterval(() => savedCallback.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}
