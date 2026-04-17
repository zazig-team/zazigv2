/**
 * zazigv2 — Quiet Hours Utilities
 *
 * Pure functions for evaluating quiet hours windows.
 * Used by iOS push notification suppression and the shared settings UI.
 */

export interface QuietHoursEntry {
  day: string;   // "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"
  start: string; // "HH:MM" 24h
  end: string;   // "HH:MM" 24h
}

/**
 * Returns true if the given day and time fall within any quiet hours window.
 * Supports midnight-spanning windows where start > end (e.g. 22:00–07:00).
 */
export function isQuietNow(
  entries: QuietHoursEntry[],
  day: string,
  time: string,
): boolean {
  for (const entry of entries) {
    if (entry.day !== day) continue;
    if (isWithinWindow(entry.start, entry.end, time)) return true;
  }
  return false;
}

function isWithinWindow(start: string, end: string, time: string): boolean {
  if (start <= end) {
    // Normal window: start <= time <= end
    return time >= start && time <= end;
  } else {
    // Midnight-spanning window: time >= start OR time <= end
    return time >= start || time <= end;
  }
}

/**
 * Returns preset quiet hours entries for weeknights (Mon–Fri, 22:00–07:00).
 */
export function buildWeeknightsPreset(): QuietHoursEntry[] {
  return ['mon', 'tue', 'wed', 'thu', 'fri'].map(day => ({
    day,
    start: '22:00',
    end: '07:00',
  }));
}

/**
 * Returns preset quiet hours entries for weekends (Sat–Sun, all day).
 */
export function buildWeekendsPreset(): QuietHoursEntry[] {
  return ['sat', 'sun'].map(day => ({
    day,
    start: '00:00',
    end: '23:59',
  }));
}
