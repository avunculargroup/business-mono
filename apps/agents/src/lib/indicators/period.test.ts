import { describe, it, expect } from 'vitest';
import { parseSdmxTimePeriod } from './period.js';

/**
 * The SDMX time-period parser.
 *
 * The hard convention this file exists for is that every adapter stamps
 * `periodDate` as the FIRST day of the reference period, because
 * `v_indicator_latest` joins prior and year-ago observations on that column. A
 * quarter filed under its last day, or a month under the day it was published,
 * misaligns those joins silently — the card still renders, with the wrong
 * comparison.
 */
describe('parseSdmxTimePeriod', () => {
  it('collapses a quarter to its first day', () => {
    expect(parseSdmxTimePeriod('2026-Q1')).toBe('2026-01-01');
    expect(parseSdmxTimePeriod('2026-Q2')).toBe('2026-04-01');
    expect(parseSdmxTimePeriod('2026-Q3')).toBe('2026-07-01');
    expect(parseSdmxTimePeriod('2026-Q4')).toBe('2026-10-01');
  });

  it('accepts the unhyphenated quarter some providers emit', () => {
    expect(parseSdmxTimePeriod('2026Q3')).toBe('2026-07-01');
  });

  it('collapses a month to its first day', () => {
    expect(parseSdmxTimePeriod('2026-08')).toBe('2026-08-01');
  });

  it('reads an annual period as the first of the year', () => {
    expect(parseSdmxTimePeriod('2026')).toBe('2026-01-01');
  });

  it('lets the period in the value decide, not the granularity passed in', () => {
    // A series that prints quarters is quarterly whatever the registry row
    // says, and honouring the row instead would misfile it the moment the two
    // disagree — which is exactly when it matters.
    expect(parseSdmxTimePeriod('2026-Q2', 'monthly')).toBe('2026-04-01');
    expect(parseSdmxTimePeriod('2026-08', 'quarterly')).toBe('2026-08-01');
  });

  it('uses granularity only for a full date, the one ambiguous case', () => {
    expect(parseSdmxTimePeriod('2026-08-15', 'daily')).toBe('2026-08-15');
    expect(parseSdmxTimePeriod('2026-08-15', 'monthly')).toBe('2026-08-01');
    expect(parseSdmxTimePeriod('2026-08-15', 'quarterly')).toBe('2026-07-01');
  });

  it('returns null for a period it does not understand', () => {
    // Weeks and semesters are valid SDMX and not supported. Null lets the
    // caller fail naming the value, which beats guessing a month for it.
    expect(parseSdmxTimePeriod('2026-W03')).toBeNull();
    expect(parseSdmxTimePeriod('2026-S1')).toBeNull();
    expect(parseSdmxTimePeriod('')).toBeNull();
    expect(parseSdmxTimePeriod('not a period')).toBeNull();
  });

  it('rejects an out-of-range month or day rather than rolling it over', () => {
    // new Date(Date.UTC(2026, 12, 1)) is January 2027, silently. A provider
    // sending month 13 has a problem worth surfacing, not normalising.
    expect(parseSdmxTimePeriod('2026-13')).toBeNull();
    expect(parseSdmxTimePeriod('2026-00')).toBeNull();
    expect(parseSdmxTimePeriod('2026-08-32')).toBeNull();
  });
});
