import { File, FileImage, FileText } from 'lucide-react';
import { isImage, isPdf } from '@/lib/files';

/** Picks a document icon from a mime type: image, pdf, or a generic file. */
export function FileIcon({ mime, size = 32 }: { mime: string; size?: number }) {
  if (isImage(mime)) return <FileImage size={size} strokeWidth={1.5} />;
  if (isPdf(mime)) return <FileText size={size} strokeWidth={1.5} />;
  return <File size={size} strokeWidth={1.5} />;
}
