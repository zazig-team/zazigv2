/**
 * Typing indicator utility — manages debounced typing state with set/clear/timeout semantics.
 *
 * Usage:
 *   const indicator = createTypingIndicator({ timeoutMs: 5000, onExpire: () => broadcastIdle() });
 *   indicator.setTyping();   // call on every keystroke
 *   indicator.clearTyping(); // call immediately on message send
 *   indicator.dispose();     // cleanup on unmount
 */

export interface TypingIndicatorHandle {
  /** Signal that the user is typing. Resets the idle timeout. */
  setTyping(): void;
  /** Immediately clear the typing indicator and cancel the pending timeout. Fires onExpire. */
  clearTyping(): void;
  /** Dispose the indicator and cancel any pending timeout without firing onExpire. */
  dispose(): void;
}

export interface TypingIndicatorOptions {
  /** Idle timeout in milliseconds before onExpire fires automatically. Default: 5000 ms. */
  timeoutMs?: number;
  /** Called when the typing indicator expires (idle timeout or clearTyping). */
  onExpire: () => void;
}

const DEFAULT_TIMEOUT = 5000;

/**
 * Create a typing indicator that fires `onExpire` after `timeoutMs` of inactivity,
 * or immediately when `clearTyping()` is called.
 */
export function createTypingIndicator(opts: TypingIndicatorOptions): TypingIndicatorHandle {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function cancelTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleExpiry() {
    cancelTimer();
    timer = setTimeout(() => {
      timer = null;
      if (!disposed) {
        opts.onExpire();
      }
    }, timeoutMs);
  }

  return {
    setTyping() {
      if (disposed) return;
      scheduleExpiry();
    },

    clearTyping() {
      if (disposed) return;
      cancelTimer();
      opts.onExpire();
    },

    dispose() {
      disposed = true;
      cancelTimer();
    },
  };
}
