import { describe, it, expect } from 'vitest';

import { formatBytes, isImage, isPdf, getFileExt } from './files';

describe('formatBytes', () => {
  it('renders an em dash for null or zero', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(0)).toBe('—');
  });

  it('formats bytes, KB, and MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('isImage / isPdf', () => {
  it('detects image mime types', () => {
    expect(isImage('image/png')).toBe(true);
    expect(isImage('application/pdf')).toBe(false);
  });

  it('detects pdf mime types', () => {
    expect(isPdf('application/pdf')).toBe(true);
    expect(isPdf('image/jpeg')).toBe(false);
  });
});

describe('getFileExt', () => {
  it('returns the lowercased extension', () => {
    expect(getFileExt('Report.PDF')).toBe('pdf');
    expect(getFileExt('archive.tar.gz')).toBe('gz');
  });

  it('returns the whole name lowercased when there is no dot', () => {
    expect(getFileExt('README')).toBe('readme');
  });
});
