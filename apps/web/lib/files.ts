// File presentation + upload helpers shared by the Files view and its dialogs.
// Extracted from FilesView so the format logic is unit-testable and the view no
// longer carries it inline.

/** Human-readable byte size (B / KB / MB). Null or zero renders as an em dash. */
export function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}

export function isPdf(mime: string): boolean {
  return mime === 'application/pdf';
}

export function getFileExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? 'file';
}

/**
 * PUT a file to a signed storage URL, reporting progress. Uses XHR (not fetch)
 * because upload progress events aren't available on fetch.
 */
export function uploadWithProgress(
  signedUrl: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    });
    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.send(file);
  });
}
