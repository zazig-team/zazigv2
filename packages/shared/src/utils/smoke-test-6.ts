export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const monthMs = 30 * dayMs;

  if (diffMs < minuteMs) {
    return "just now";
  }

  if (diffMs < hourMs) {
    const minutes = Math.floor(diffMs / minuteMs);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  if (diffMs < dayMs) {
    const hours = Math.floor(diffMs / hourMs);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  if (diffMs < monthMs) {
    const days = Math.floor(diffMs / dayMs);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  const months = Math.floor(diffMs / monthMs);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export function formatDuration(ms: number): string {
  const secondMs = 1000;
  const minuteMs = 60 * secondMs;
  const hourMs = 60 * minuteMs;

  if (ms === 0) {
    return "0ms";
  }

  if (ms < secondMs) {
    return `${ms}ms`;
  }

  if (ms < minuteMs) {
    const seconds = Math.floor(ms / secondMs);
    return `${seconds}s`;
  }

  if (ms < hourMs) {
    const minutes = Math.floor(ms / minuteMs);
    const seconds = Math.floor((ms % minuteMs) / secondMs);
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(ms / hourMs);
  const minutes = Math.floor((ms % hourMs) / minuteMs);
  return `${hours}h ${minutes}m`;
}
