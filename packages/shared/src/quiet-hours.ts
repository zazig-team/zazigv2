export interface QuietHoursEntry {
  day: string;   // "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"
  start: string; // "HH:MM" 24h
  end: string;   // "HH:MM" 24h
}

/**
 * Returns true if the given day and time fall within any quiet hours window.
 * Handles midnight-spanning windows (when start > end, e.g. 22:00–07:00).
 */
export function isQuietNow(
  entries: QuietHoursEntry[],
  day: string,
  time: string,
): boolean {
  for (const entry of entries) {
    if (entry.day !== day) continue;

    if (entry.start <= entry.end) {
      // Normal window (or same start/end)
      if (time >= entry.start && time <= entry.end) return true;
    } else {
      // Midnight-spanning window (e.g. 22:00–07:00)
      if (time >= entry.start || time <= entry.end) return true;
    }
  }
  return false;
}

/** Returns 5 entries covering Mon–Fri 22:00–07:00. */
export function buildWeeknightsPreset(): QuietHoursEntry[] {
  return ['mon', 'tue', 'wed', 'thu', 'fri'].map(day => ({
    day,
    start: '22:00',
    end: '07:00',
  }));
}

/** Returns 2 entries covering Sat–Sun 00:00–23:59. */
export function buildWeekendsPreset(): QuietHoursEntry[] {
  return ['sat', 'sun'].map(day => ({
    day,
    start: '00:00',
    end: '23:59',
  }));
}
