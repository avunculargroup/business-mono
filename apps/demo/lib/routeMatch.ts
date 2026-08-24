import { ANNOTATIONS, type Annotation } from './annotations';

/**
 * Matches an annotation's route against a pathname.
 *
 * Annotation routes are written the way the spec writes them — including
 * `/market-reports/[id]` — so a segment in brackets matches any single segment.
 * Comparing literally would silently show nothing on every detail page, a
 * failure that looks exactly like "this page has no annotations".
 *
 * Pure, and in its own module rather than beside the component, so it is
 * testable in the node environment without pulling JSX through it.
 */
export function matchesRoute(route: string, pathname: string): boolean {
  const routeParts = route.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (routeParts.length !== pathParts.length) return false;

  return routeParts.every(
    (part, index) => (part.startsWith('[') && part.endsWith(']')) || part === pathParts[index],
  );
}

export function annotationsFor(pathname: string): Annotation[] {
  return ANNOTATIONS.filter((annotation) => matchesRoute(annotation.route, pathname)).sort(
    (a, b) => a.order - b.order,
  );
}
