export interface Duration {
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;

function toNonNegativeInteger(value: number): number {
  if (!isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

export function parseDuration(ms: number): Duration {
  let remaining = toNonNegativeInteger(ms);

  const hours = Math.floor(remaining / HOUR_MS);
  remaining %= HOUR_MS;

  const minutes = Math.floor(remaining / MINUTE_MS);
  remaining %= MINUTE_MS;

  const seconds = Math.floor(remaining / SECOND_MS);
  const milliseconds = remaining % SECOND_MS;

  return {
    hours,
    minutes,
    seconds,
    milliseconds,
  };
}

export function durationToMs(d: Duration): number {
  const hours = toNonNegativeInteger(d.hours);
  const minutes = toNonNegativeInteger(d.minutes);
  const seconds = toNonNegativeInteger(d.seconds);
  const milliseconds = toNonNegativeInteger(d.milliseconds);

  return (
    hours * HOUR_MS +
    minutes * MINUTE_MS +
    seconds * SECOND_MS +
    milliseconds
  );
}

export function formatDuration(d: Duration): string {
  const parts: string[] = [];

  const hours = toNonNegativeInteger(d.hours);
  const minutes = toNonNegativeInteger(d.minutes);
  const seconds = toNonNegativeInteger(d.seconds);
  const milliseconds = toNonNegativeInteger(d.milliseconds);

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  if (seconds > 0) {
    parts.push(`${seconds}s`);
  }

  if (milliseconds > 0) {
    parts.push(`${milliseconds}ms`);
  }

  return parts.length > 0 ? parts.join(" ") : "0ms";
}

export function addDurations(a: Duration, b: Duration): Duration {
  return parseDuration(durationToMs(a) + durationToMs(b));
}

export function compareDurations(a: Duration, b: Duration): -1 | 0 | 1 {
  const aMs = durationToMs(a);
  const bMs = durationToMs(b);

  if (aMs < bMs) {
    return -1;
  }

  if (aMs > bMs) {
    return 1;
  }

  return 0;
}
