/**
 * Splits an array into chunks of a fixed size.
 *
 * @template T The element type.
 * @param array The array to split.
 * @param size The maximum number of elements per chunk. Must be at least 1.
 * @returns A new array containing chunked sub-arrays.
 * @throws {Error} If `size` is less than 1.
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (size < 1) {
    throw new Error("Chunk size must be at least 1");
  }

  const chunks: T[][] = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}
