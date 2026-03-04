/**
 * Groups an array of items by a key generated from each item.
 *
 * @param array - Source array to group.
 * @param keyFn - Function that returns the grouping key for each item.
 * @returns An object whose keys are the grouped key values and values are arrays of items.
 */
export function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};

  for (const item of array) {
    const key = keyFn(item);

    if (!(key in grouped)) {
      grouped[key] = [];
    }

    grouped[key].push(item);
  }

  return grouped;
}
