import { describe, expect, it } from 'vitest';
import { formatIdentifiers } from './identifiers';

describe('formatIdentifiers', () => {
  it('says so when a record holds no registration number', () => {
    expect(formatIdentifiers([])).toBe('Not recorded');
  });

  it('shows every identifier, including a superseded one with its end date', () => {
    expect(
      formatIdentifiers([
        { scheme: 'sec_cik', value: '1671941', validFrom: null, validTo: '2025-06-30' },
        { scheme: 'sec_cik', value: '1865200', validFrom: '2025-07-01', validTo: null },
      ]),
    ).toBe('SEC CIK 1671941 (to 2025-06-30) · SEC CIK 1865200');
  });

  it('labels a scheme it has no name for from the scheme code', () => {
    expect(
      formatIdentifiers([{ scheme: 'kvk_number', value: '123', validFrom: null, validTo: null }]),
    ).toBe('kvk number 123');
  });
});
