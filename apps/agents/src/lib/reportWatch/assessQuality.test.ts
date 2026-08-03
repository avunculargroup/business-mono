import { describe, it, expect } from 'vitest';
import { assessExtraction, alphaRatio, pageIsGood, countWords } from './assessQuality.js';

/** A page of real prose — several hundred letters, overwhelmingly alphabetic. */
const goodPage = 'Bitcoin adoption among Australian corporates continued to broaden through the quarter. '.repeat(4);
/** A scanned page: a few stray ligatures the text layer recovered. */
const scannedPage = 'fi fl ';
/** A garbled text layer: a subset font with no ToUnicode map. */
const garbledPage = '!@#$%^&*()_+{}|:"<>?'.repeat(20);

describe('alphaRatio', () => {
  it('is high for prose and low for symbol soup', () => {
    expect(alphaRatio(goodPage)).toBeGreaterThan(0.8);
    expect(alphaRatio(garbledPage)).toBeLessThan(0.6);
  });

  it('is zero for whitespace only', () => {
    expect(alphaRatio('   \n\t ')).toBe(0);
  });
});

describe('pageIsGood', () => {
  it('rejects a page under the character floor even when it is all letters', () => {
    expect(pageIsGood(scannedPage)).toBe(false);
    expect(pageIsGood(goodPage)).toBe(true);
  });

  it('rejects a long page of garbage on the alpha ratio', () => {
    expect(pageIsGood(garbledPage)).toBe(false);
  });
});

describe('assessExtraction', () => {
  it('calls a clean document good', () => {
    const { quality, metrics, badPages } = assessExtraction([goodPage, goodPage, goodPage]);
    expect(quality).toBe('good');
    expect(badPages).toEqual([]);
    expect(metrics.page_count).toBe(3);
    expect(metrics.empty_page_count).toBe(0);
  });

  it('calls a minority of bad pages partial and names them', () => {
    const { quality, badPages } = assessExtraction([goodPage, goodPage, goodPage, scannedPage]);
    expect(quality).toBe('partial');
    expect(badPages).toEqual([3]);
  });

  it('calls a majority of bad pages failed', () => {
    const { quality } = assessExtraction([goodPage, scannedPage, scannedPage]);
    expect(quality).toBe('failed');
  });

  it('reports failed for an empty extraction without dividing by zero', () => {
    const { quality, metrics } = assessExtraction([]);
    expect(quality).toBe('failed');
    expect(metrics.chars_per_page).toBe(0);
  });

  it('carries the ocr page count through into the metrics', () => {
    const { metrics } = assessExtraction([goodPage, goodPage], 2);
    expect(metrics.ocr_pages).toBe(2);
  });

  it('counts blank pages without treating them as the only failure mode', () => {
    const { metrics, badPages } = assessExtraction([goodPage, '', goodPage]);
    expect(metrics.empty_page_count).toBe(1);
    expect(badPages).toEqual([1]);
  });
});

describe('countWords', () => {
  it('counts whitespace-separated tokens and handles an empty body', () => {
    expect(countWords('  one two   three \n four ')).toBe(4);
    expect(countWords('   ')).toBe(0);
  });
});
