import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSdmxResponse, parseDataflowRef } from './sdmx.js';
import { startPeriodFor } from './sdmxWindow.js';
import { isAddressableDataflow } from './oecd.js';

/**
 * The fixtures here are synthesised from the SDMX-JSON spec rather than
 * recorded — see `__fixtures__/README.md`. So these cases prove the parser
 * navigates the encoding, and deliberately do not claim the AU CPI row will
 * ingest. That claim needs one live run, which is what `is_active = false` is
 * waiting for.
 */
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8'));
}

describe('parseSdmxResponse', () => {
  it('reads the 1.0 encoding: one series, observations keyed by time index', () => {
    const res = parseSdmxResponse(fixture('sdmx-abs-cpi.json'), 'quarterly', 'ABS');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Four periods, the last suppressed — three observations, oldest→newest,
    // each quarter collapsed to its first day.
    expect(res.observations.map((o) => o.periodDate)).toEqual([
      '2025-07-01',
      '2025-10-01',
      '2026-01-01',
    ]);
    expect(res.observations.map((o) => o.value)).toEqual([135.2, 136.1, 137.0]);
  });

  it('skips a null figure rather than failing on it', () => {
    const res = parseSdmxResponse(fixture('sdmx-abs-cpi.json'), 'quarterly', 'ABS');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // 2026-Q2 is in the structure with a null value: the period exists and the
    // figure is suppressed or unpublished, which is FRED's "." case by another
    // name — a skip, not an error.
    expect(res.observations.map((o) => o.periodDate)).not.toContain('2026-04-01');
  });

  it('keeps releasedAt null and the time period in raw, per the contract', () => {
    const res = parseSdmxResponse(fixture('sdmx-abs-cpi.json'), 'quarterly', 'ABS');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const latest = res.observations.at(-1)!;
    expect(latest.releasedAt).toBeNull();
    expect(latest.raw).toMatchObject({ timePeriod: '2026-Q1' });
  });

  it('reads the 2.0 encoding: structures[] and a flat observation map', () => {
    const res = parseSdmxResponse(fixture('sdmx-oecd-v2-flat.json'), 'monthly', 'OECD');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Flat keys carry every dimension with time last, so the index has to come
    // off the end of "0:0:0:2" rather than the whole key being a number.
    expect(res.observations.map((o) => o.periodDate)).toEqual([
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
    ]);
    expect(res.observations.map((o) => o.value)).toEqual([101.4, 100.8, 99.7]);
  });

  it('refuses a multi-series answer instead of picking one', () => {
    const res = parseSdmxResponse(fixture('sdmx-multi-series.json'), 'quarterly', 'ABS');
    expect(res.ok).toBe(false);
    if (res.ok) return;

    expect(res.error.kind).toBe('parse');
    // The message has to say what to do about it: a dataflow asked for without
    // a data key returns every series, and which one the indicator meant is not
    // the adapter's to guess.
    expect(res.error.message).toContain('3 series');
    expect(res.error.message).toContain('provider_table_ref');
  });

  it('names an SDMX error document rather than reporting no data', () => {
    const res = parseSdmxResponse(fixture('sdmx-error-document.json'), 'quarterly', 'ABS');
    expect(res.ok).toBe(false);
    if (res.ok) return;

    expect(res.error.kind).toBe('parse');
    // Served with a 200 by some SDMX endpoints, so the transport layer sees
    // nothing wrong. Quoting the body is what makes it diagnosable.
    expect(res.error.message).toContain('not an SDMX data message');
    expect(res.error.message).toContain('Invalid data key');
  });

  it('quotes the payload on every parse failure', () => {
    const res = parseSdmxResponse({ dataSets: [], structure: {} }, 'monthly', 'ABS');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain('{');
  });

  it('fails on a TIME_PERIOD it does not understand', () => {
    const res = parseSdmxResponse(
      {
        dataSets: [{ series: { '0:0': { observations: { 0: [1.5] } } } }],
        structure: { dimensions: { observation: [{ id: 'TIME_PERIOD', values: [{ id: '2026-W03' }] }] } },
      },
      'monthly',
      'ABS',
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain('2026-W03');
  });

  it('fails when an observation points past the periods the structure defines', () => {
    const res = parseSdmxResponse(
      {
        dataSets: [{ series: { '0:0': { observations: { 7: [1.5] } } } }],
        structure: { dimensions: { observation: [{ id: 'TIME_PERIOD', values: [{ id: '2026-Q1' }] }] } },
      },
      'quarterly',
      'ABS',
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // The index-keyed encoding's characteristic failure: a structure and a
    // dataset that disagree produce a confident wrong answer if unchecked.
    expect(res.error.message).toContain('time index 7');
  });

  it('fails on a non-numeric figure rather than emitting NaN', () => {
    const res = parseSdmxResponse(
      {
        dataSets: [{ series: { '0:0': { observations: { 0: ['not a number'] } } } }],
        structure: { dimensions: { observation: [{ id: 'TIME_PERIOD', values: [{ id: '2026-Q1' }] }] } },
      },
      'quarterly',
      'ABS',
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain('non-numeric');
  });

  it('picks TIME_PERIOD by name when several observation dimensions exist', () => {
    const res = parseSdmxResponse(
      {
        dataSets: [{ series: { '0:0': { observations: { 0: [4.2] } } } }],
        structure: {
          dimensions: {
            observation: [
              { id: 'SOMETHING_ELSE', values: [{ id: 'x' }] },
              { id: 'TIME_PERIOD', values: [{ id: '2026-01' }] },
            ],
          },
        },
      },
      'monthly',
      'ABS',
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations[0]!.periodDate).toBe('2026-01-01');
  });
});

describe('parseDataflowRef', () => {
  it('reads the AU Business Confidence ref as seeded, spaces and all', () => {
    expect(parseDataflowRef('DSD_STES@DF_CLI / AUS.M.BCICP...AA')).toEqual({
      dataflow: 'DSD_STES@DF_CLI',
      dataKey: 'AUS.M.BCICP...AA',
    });
  });

  it('reads a bare dataflow as having no data key', () => {
    expect(parseDataflowRef('CPI')).toEqual({ dataflow: 'CPI', dataKey: null });
  });

  it('keeps commas in an OECD three-part dataflow reference', () => {
    expect(parseDataflowRef('OECD.SDD.STES,DSD_STES@DF_CLI,/AUS.M.BCICP...AA')).toEqual({
      dataflow: 'OECD.SDD.STES,DSD_STES@DF_CLI,',
      dataKey: 'AUS.M.BCICP...AA',
    });
  });
});

describe('isAddressableDataflow', () => {
  it('rejects the seeded OECD ref, which names no agency', () => {
    expect(isAddressableDataflow('DSD_STES@DF_CLI')).toBe(false);
  });

  it('accepts a three-part reference', () => {
    expect(isAddressableDataflow('OECD.SDD.STES,DSD_STES@DF_CLI,')).toBe(true);
  });
});

describe('startPeriodFor', () => {
  const now = new Date('2026-09-20T00:00:00Z');

  it('reaches back far enough to cover the quarters asked for, plus one', () => {
    // 19 quarters — 57 months — before September 2026 is December 2021.
    expect(startPeriodFor('quarterly', 18, now)).toBe('2021-12-01');
  });

  it('counts months for a monthly series', () => {
    expect(startPeriodFor('monthly', 18, now)).toBe('2025-02-01');
  });

  it('counts days for a daily series', () => {
    expect(startPeriodFor('daily', 90, now)).toBe('2026-06-21');
  });

  it('never asks for a zero-length window', () => {
    // Floors at one period, then adds the slack period: two months back.
    expect(startPeriodFor('monthly', 0, now)).toBe('2026-07-01');
  });
});
