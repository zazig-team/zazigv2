/**
 * Capitalizes the first character of a string.
 *
 * @param str - The input string.
 * @returns The input string with the first character uppercased, or an empty string.
 */
export function capitalize(str: string): string {
  if (str.length === 0) {
    return "";
  }

  return `${str[0].toUpperCase()}${str.slice(1)}`;
}

/**
 * Capitalizes the first character of each word in a string.
 *
 * @param str - The input string.
 * @returns The input string with each word's first character uppercased, or an empty string.
 */
export function capitalizeWords(str: string): string {
  if (str.length === 0) {
    return "";
  }

  return str
    .split(" ")
    .map((word) => (word.length > 0 ? `${word[0].toUpperCase()}${word.slice(1)}` : ""))
    .join(" ");
}
