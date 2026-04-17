/**
 * Feature: Add quiet hours settings to suppress push notifications
 *
 * Tests for acceptance criteria 3–5, 7–8, 10:
 *   AC3:  During an active quiet hours window, notifications are not shown
 *   AC4:  Outside all quiet hours windows, notifications surface normally
 *   AC5:  Midnight-spanning window correctly suppresses at 23:30 and 06:00
 *   AC7:  Disabling quiet hours (empty entries) re-enables all notifications
 *   AC8:  All-day suppression (00:00–23:59) suppresses all day
 *   AC10: Multiple entries for the same day all respected independently
 *
 * Tests the pure isQuietNow() logic extracted as a TypeScript utility.
 * These tests will FAIL until the feature is implemented.
 */

import { describe, it, expect } from 'vitest';
import { isQuietNow } from '../../packages/shared/src/quiet-hours.js';

// ---------------------------------------------------------------------------
// Types matching the spec
// ---------------------------------------------------------------------------

interface QuietHoursEntry {
  day: string;   // "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"
  start: string; // "HH:MM" 24h
  end: string;   // "HH:MM" 24h
}

// ---------------------------------------------------------------------------
// AC3 & AC4: Normal window (start <= end)
// ---------------------------------------------------------------------------

describe('AC3 & AC4: Normal quiet window suppression and passthrough', () => {
  const entries: QuietHoursEntry[] = [
    { day: 'mon', start: '09:00', end: '12:00' },
  ];

  it('suppresses when current time is exactly at window start', () => {
    // Monday 09:00 — inside window
    expect(isQuietNow(entries, 'mon', '09:00')).toBe(true);
  });

  it('suppresses when current time is inside the window', () => {
    // Monday 10:30 — inside 09:00–12:00
    expect(isQuietNow(entries, 'mon', '10:30')).toBe(true);
  });

  it('suppresses when current time is exactly at window end', () => {
    // Monday 12:00 — at end, still inside
    expect(isQuietNow(entries, 'mon', '12:00')).toBe(true);
  });

  it('does NOT suppress when current time is before the window', () => {
    // Monday 08:59 — before 09:00
    expect(isQuietNow(entries, 'mon', '08:59')).toBe(false);
  });

  it('does NOT suppress when current time is after the window', () => {
    // Monday 12:01 — after 12:00
    expect(isQuietNow(entries, 'mon', '12:01')).toBe(false);
  });

  it('does NOT suppress on a different day', () => {
    // Tuesday 10:30 — entries only cover Monday
    expect(isQuietNow(entries, 'tue', '10:30')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC5: Midnight-spanning window (start > end)
// ---------------------------------------------------------------------------

describe('AC5: Midnight-spanning quiet window (e.g. 22:00–07:00)', () => {
  const entries: QuietHoursEntry[] = [
    { day: 'wed', start: '22:00', end: '07:00' },
  ];

  it('suppresses at 23:30 on the configured day', () => {
    expect(isQuietNow(entries, 'wed', '23:30')).toBe(true);
  });

  it('suppresses at 22:00 on the configured day (start boundary)', () => {
    expect(isQuietNow(entries, 'wed', '22:00')).toBe(true);
  });

  it('suppresses at 00:00 on the configured day (post-midnight)', () => {
    expect(isQuietNow(entries, 'wed', '00:00')).toBe(true);
  });

  it('suppresses at 06:00 on the configured day (within morning half)', () => {
    expect(isQuietNow(entries, 'wed', '06:00')).toBe(true);
  });

  it('suppresses at 07:00 on the configured day (end boundary)', () => {
    expect(isQuietNow(entries, 'wed', '07:00')).toBe(true);
  });

  it('does NOT suppress at 07:01 (just after window end)', () => {
    expect(isQuietNow(entries, 'wed', '07:01')).toBe(false);
  });

  it('does NOT suppress at 21:59 (just before window start)', () => {
    expect(isQuietNow(entries, 'wed', '21:59')).toBe(false);
  });

  it('does NOT suppress on a different day', () => {
    expect(isQuietNow(entries, 'thu', '23:30')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC7: Empty entries → quiet hours disabled, no suppression
// ---------------------------------------------------------------------------

describe('AC7: Empty entries array — quiet hours disabled', () => {
  it('does NOT suppress when entries is empty []', () => {
    expect(isQuietNow([], 'mon', '10:00')).toBe(false);
  });

  it('does NOT suppress when entries is empty at any time', () => {
    expect(isQuietNow([], 'sun', '03:00')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC8: All-day suppression (00:00–23:59)
// ---------------------------------------------------------------------------

describe('AC8: All-day suppression with 00:00–23:59', () => {
  const entries: QuietHoursEntry[] = [
    { day: 'sat', start: '00:00', end: '23:59' },
  ];

  it('suppresses at the very start of the day (00:00)', () => {
    expect(isQuietNow(entries, 'sat', '00:00')).toBe(true);
  });

  it('suppresses at noon', () => {
    expect(isQuietNow(entries, 'sat', '12:00')).toBe(true);
  });

  it('suppresses at 23:59 (end of day)', () => {
    expect(isQuietNow(entries, 'sat', '23:59')).toBe(true);
  });

  it('does NOT suppress on a different day', () => {
    expect(isQuietNow(entries, 'sun', '12:00')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC10: Multiple entries for same day all respected independently
// ---------------------------------------------------------------------------

describe('AC10: Multiple entries for the same day (lunch break + overnight)', () => {
  const entries: QuietHoursEntry[] = [
    { day: 'fri', start: '12:00', end: '13:00' }, // lunch break
    { day: 'fri', start: '22:00', end: '07:00' }, // overnight (midnight-spanning)
  ];

  it('suppresses during lunch break window (12:30)', () => {
    expect(isQuietNow(entries, 'fri', '12:30')).toBe(true);
  });

  it('suppresses during overnight window (23:00)', () => {
    expect(isQuietNow(entries, 'fri', '23:00')).toBe(true);
  });

  it('suppresses during overnight morning half (06:00)', () => {
    expect(isQuietNow(entries, 'fri', '06:00')).toBe(true);
  });

  it('does NOT suppress between windows (e.g. 14:00)', () => {
    expect(isQuietNow(entries, 'fri', '14:00')).toBe(false);
  });

  it('does NOT suppress before lunch (11:59)', () => {
    expect(isQuietNow(entries, 'fri', '11:59')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC11: Preset "Weeknights" — Mon–Fri 22:00–07:00
// ---------------------------------------------------------------------------

describe('AC11 (logic): Weeknights preset covers Mon–Fri 22:00–07:00', () => {
  // The preset produces 5 entries; verify the logic handles them all
  const weeknightEntries: QuietHoursEntry[] = [
    { day: 'mon', start: '22:00', end: '07:00' },
    { day: 'tue', start: '22:00', end: '07:00' },
    { day: 'wed', start: '22:00', end: '07:00' },
    { day: 'thu', start: '22:00', end: '07:00' },
    { day: 'fri', start: '22:00', end: '07:00' },
  ];

  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri']) {
    it(`suppresses at 23:00 on ${day}`, () => {
      expect(isQuietNow(weeknightEntries, day, '23:00')).toBe(true);
    });

    it(`suppresses at 06:00 on ${day} (morning half)`, () => {
      expect(isQuietNow(weeknightEntries, day, '06:00')).toBe(true);
    });

    it(`does NOT suppress at 12:00 on ${day}`, () => {
      expect(isQuietNow(weeknightEntries, day, '12:00')).toBe(false);
    });
  }

  it('does NOT suppress on Saturday', () => {
    expect(isQuietNow(weeknightEntries, 'sat', '23:00')).toBe(false);
  });

  it('does NOT suppress on Sunday', () => {
    expect(isQuietNow(weeknightEntries, 'sun', '23:00')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC12: Preset "Weekends" — Sat–Sun 00:00–23:59
// ---------------------------------------------------------------------------

describe('AC12 (logic): Weekends preset covers Sat–Sun all day', () => {
  const weekendEntries: QuietHoursEntry[] = [
    { day: 'sat', start: '00:00', end: '23:59' },
    { day: 'sun', start: '00:00', end: '23:59' },
  ];

  it('suppresses at any time on Saturday', () => {
    expect(isQuietNow(weekendEntries, 'sat', '09:00')).toBe(true);
    expect(isQuietNow(weekendEntries, 'sat', '23:59')).toBe(true);
  });

  it('suppresses at any time on Sunday', () => {
    expect(isQuietNow(weekendEntries, 'sun', '00:00')).toBe(true);
    expect(isQuietNow(weekendEntries, 'sun', '18:00')).toBe(true);
  });

  it('does NOT suppress on weekdays', () => {
    for (const day of ['mon', 'tue', 'wed', 'thu', 'fri']) {
      expect(isQuietNow(weekendEntries, day, '10:00')).toBe(false);
    }
  });
});
