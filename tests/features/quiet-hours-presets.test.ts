/**
 * Feature: Add quiet hours settings to suppress push notifications
 *
 * Tests for acceptance criteria 6, 11, 12:
 *   AC6:  Changes take effect immediately without app restart
 *   AC11: Preset "Weeknights" button populates Mon–Fri 22:00–07:00 entries
 *   AC12: Preset "Weekends" button populates Sat–Sun 00:00–23:59 entries
 *
 * Tests the preset builder utilities exported from the shared quiet-hours module.
 * Written to FAIL until the feature is implemented.
 */

import { describe, it, expect } from 'vitest';
import {
  buildWeeknightsPreset,
  buildWeekendsPreset,
} from '../../packages/shared/src/quiet-hours.js';

// ---------------------------------------------------------------------------
// AC11: "Weeknights" preset — Mon–Fri 22:00–07:00
// ---------------------------------------------------------------------------

describe('AC11: buildWeeknightsPreset() produces Mon–Fri 22:00–07:00 entries', () => {
  it('returns exactly 5 entries', () => {
    const entries = buildWeeknightsPreset();
    expect(entries).toHaveLength(5);
  });

  it('covers all weekdays (mon, tue, wed, thu, fri)', () => {
    const entries = buildWeeknightsPreset();
    const days = entries.map(e => e.day).sort();
    expect(days).toEqual(['fri', 'mon', 'thu', 'tue', 'wed']);
  });

  it('does NOT include sat or sun', () => {
    const entries = buildWeeknightsPreset();
    const days = entries.map(e => e.day);
    expect(days).not.toContain('sat');
    expect(days).not.toContain('sun');
  });

  it('every entry has start: "22:00"', () => {
    const entries = buildWeeknightsPreset();
    for (const entry of entries) {
      expect(entry.start).toBe('22:00');
    }
  });

  it('every entry has end: "07:00"', () => {
    const entries = buildWeeknightsPreset();
    for (const entry of entries) {
      expect(entry.end).toBe('07:00');
    }
  });

  it('entry for monday has correct shape', () => {
    const entries = buildWeeknightsPreset();
    const mon = entries.find(e => e.day === 'mon');
    expect(mon).toBeDefined();
    expect(mon).toMatchObject({ day: 'mon', start: '22:00', end: '07:00' });
  });

  it('entry for friday has correct shape', () => {
    const entries = buildWeeknightsPreset();
    const fri = entries.find(e => e.day === 'fri');
    expect(fri).toBeDefined();
    expect(fri).toMatchObject({ day: 'fri', start: '22:00', end: '07:00' });
  });
});

// ---------------------------------------------------------------------------
// AC12: "Weekends" preset — Sat–Sun 00:00–23:59
// ---------------------------------------------------------------------------

describe('AC12: buildWeekendsPreset() produces Sat–Sun 00:00–23:59 entries', () => {
  it('returns exactly 2 entries', () => {
    const entries = buildWeekendsPreset();
    expect(entries).toHaveLength(2);
  });

  it('covers saturday and sunday only', () => {
    const entries = buildWeekendsPreset();
    const days = entries.map(e => e.day).sort();
    expect(days).toEqual(['sat', 'sun']);
  });

  it('does NOT include any weekday', () => {
    const entries = buildWeekendsPreset();
    const days = entries.map(e => e.day);
    for (const weekday of ['mon', 'tue', 'wed', 'thu', 'fri']) {
      expect(days).not.toContain(weekday);
    }
  });

  it('every entry has start: "00:00"', () => {
    const entries = buildWeekendsPreset();
    for (const entry of entries) {
      expect(entry.start).toBe('00:00');
    }
  });

  it('every entry has end: "23:59"', () => {
    const entries = buildWeekendsPreset();
    for (const entry of entries) {
      expect(entry.end).toBe('23:59');
    }
  });

  it('entry for saturday has correct shape', () => {
    const entries = buildWeekendsPreset();
    const sat = entries.find(e => e.day === 'sat');
    expect(sat).toBeDefined();
    expect(sat).toMatchObject({ day: 'sat', start: '00:00', end: '23:59' });
  });

  it('entry for sunday has correct shape', () => {
    const entries = buildWeekendsPreset();
    const sun = entries.find(e => e.day === 'sun');
    expect(sun).toBeDefined();
    expect(sun).toMatchObject({ day: 'sun', start: '00:00', end: '23:59' });
  });
});

// ---------------------------------------------------------------------------
// AC6: isQuietNow() is a pure synchronous function (immediate effect, no restart needed)
// ---------------------------------------------------------------------------

describe('AC6: isQuietNow() is synchronous — changes take effect immediately', () => {
  it('isQuietNow is exported as a function', async () => {
    const mod = await import('../../packages/shared/src/quiet-hours.js');
    expect(typeof mod.isQuietNow).toBe('function');
  });

  it('isQuietNow returns a boolean synchronously (not a Promise)', async () => {
    const { isQuietNow } = await import('../../packages/shared/src/quiet-hours.js');
    const result = isQuietNow([], 'mon', '10:00');
    expect(typeof result).toBe('boolean');
    // Must not be a Promise
    expect(result instanceof Promise).toBe(false);
  });

  it('calling isQuietNow with updated entries immediately reflects the new state', async () => {
    const { isQuietNow } = await import('../../packages/shared/src/quiet-hours.js');
    // Empty entries → not quiet
    expect(isQuietNow([], 'mon', '10:00')).toBe(false);
    // Add an entry covering the same time → now quiet
    const entries = [{ day: 'mon', start: '09:00', end: '12:00' }];
    expect(isQuietNow(entries, 'mon', '10:00')).toBe(true);
  });
});
