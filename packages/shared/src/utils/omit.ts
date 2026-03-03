/**
 * Creates a shallow copy of `obj` with the provided keys removed.
 *
 * @template T - Object shape.
 * @template K - Keys to omit from `T`.
 * @param obj - Source object.
 * @param keys - Keys to remove. Missing keys are ignored.
 * @returns A new object containing all enumerable own properties of `obj` except `keys`.
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const keysToOmit = new Set(keys)

  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keysToOmit.has(key as K)),
  ) as Omit<T, K>
}
