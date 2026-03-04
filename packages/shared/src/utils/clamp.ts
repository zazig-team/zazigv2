/**
 * Clamps a numeric value to the inclusive range defined by min and max.
 * If min is greater than max, the bounds are swapped before clamping.
 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    [min, max] = [max, min];
  }

  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}
