import { DEFAULT_TIMEZONE, dayBoundsInTz } from '@platform/shared';

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Day-aligned diff in a given timezone — DST-safe (calendar days, not 24h chunks).
function calendarDayDiff(date: Date, now: Date, tz: string): number {
  const dateBounds = dayBoundsInTz(tz, date);
  const nowBounds = dayBoundsInTz(tz, now);
  const ms = nowBounds.start.getTime() - dateBounds.start.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function formatRelativeDate(dateStr: string, tz: string = DEFAULT_TIMEZONE): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = calendarDayDiff(date, now, tz);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays === -1) return 'Tomorrow';
  if (diffDays > 0 && diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 0 && diffDays > -7) return `In ${-diffDays}d`;
  if (diffDays > 0 && diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays > 0 && diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  if (diffDays > 0) return `${Math.floor(diffDays / 365)}y ago`;
  return formatDate(dateStr, tz);
}

export function formatDate(dateStr: string, tz: string = DEFAULT_TIMEZONE): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    timeZone: tz,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr: string, tz: string = DEFAULT_TIMEZONE): string {
  return new Date(dateStr).toLocaleString('en-AU', {
    timeZone: tz,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Wall-clock time-of-day in `tz`, with the short timezone name appended
// (e.g. "7:00 am AEDT"). For showing routine next/last run alongside a
// relative date.
export function formatTimeInTz(dateStr: string, tz: string = DEFAULT_TIMEZONE): string {
  return new Date(dateStr).toLocaleTimeString('en-AU', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
