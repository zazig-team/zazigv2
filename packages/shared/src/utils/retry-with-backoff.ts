export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 10_000,
  backoffFactor: 2,
};

export async function retryWithBackoff<T>(fn: () => Promise<T>, options: Partial<RetryOptions> = {}): Promise<T> {
  const resolvedOptions: RetryOptions = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt < resolvedOptions.maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === resolvedOptions.maxAttempts - 1) {
        throw error;
      }

      const delayMs = Math.min(resolvedOptions.initialDelayMs * resolvedOptions.backoffFactor ** attempt, resolvedOptions.maxDelayMs);

      await delay(delayMs);
    }
  }

  throw lastError;
}
