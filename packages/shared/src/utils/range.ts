/**
 * Creates a range of numbers from `start` (inclusive) to `end` (exclusive),
 * stepping by `step`.
 *
 * @param start - The starting number.
 * @param end - The non-inclusive end number.
 * @param step - Optional increment/decrement. Defaults to `1` if start < end,
 *   otherwise `-1`.
 * @returns An array containing the generated number sequence.
 * @throws {Error} If `step` is `0`.
 */
export function range(start: number, end: number, step: number = start < end ? 1 : -1): number[] {
  if (step === 0) {
    throw new Error("Step cannot be zero");
  }

  if ((start < end && step < 0) || (start > end && step > 0)) {
    return [];
  }

  const values: number[] = [];

  if (start < end) {
    for (let value = start; value < end; value += step) {
      values.push(value);
    }
  } else if (start > end) {
    for (let value = start; value > end; value += step) {
      values.push(value);
    }
  }

  return values;
}
