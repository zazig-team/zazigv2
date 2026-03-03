export function formatFeatureTitle(title: string, maxLen: number): string {
  if (!title || maxLen < 4) {
    return "";
  }

  if (title.length <= maxLen) {
    return title;
  }

  return `${title.slice(0, maxLen - 3)}...`;
}

export function slugify(title: string): string {
  if (!title) {
    return "";
  }

  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
