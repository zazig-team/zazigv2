/**
 * Returns a deduplicated copy of the input array while preserving first-seen order.
 *
 * @template T - Array element type.
 * @param array - The input array to deduplicate.
 * @returns A new array containing only the first occurrence of each value.
 */
export function unique<T>(array: T[]): T[] {
  const seen = new Set<T>()
  const result: T[] = []

  for (const item of array) {
    if (!seen.has(item)) {
      seen.add(item)
      result.push(item)
    }
  }

  return result
}

/**
 * Returns a deduplicated copy of the input array using a key selector and
 * preserving first-seen order.
 *
 * @template T - Array element type.
 * @param array - The input array to deduplicate.
 * @param keyFn - Function that extracts a deduplication key from each item.
 * @returns A new array containing the first occurrence for each key.
 */
export function uniqueBy<T>(array: T[], keyFn: (item: T) => string | number): T[] {
  const seen = new Set<string | number>()
  const result: T[] = []

  for (const item of array) {
    const key = keyFn(item)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  }

  return result
}
