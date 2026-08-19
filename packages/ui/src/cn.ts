/**
 * Join class names, dropping falsy entries.
 *
 * Moved out of `apps/web/lib/utils.ts` in Phase 3 of the demo-app plan: it is consumed
 * by the shared components in this package, so leaving it in the app would have the
 * package depending on its consumer. The rest of `lib/utils` — `getInitials`,
 * `formatRelativeDate`, `isUuid` — is app formatting and stayed put.
 */
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
