/**
 * Assert a CSS-module *local* class is applied, ignoring the build hash.
 *
 * Vitest scopes CSS-module classes to `_<name>_<hash>` (its default "stable"
 * strategy) — e.g. `<StatusChip color="success">` renders `_success_2f9ed6`.
 * This matcher keys off the stable local name so design-system primitives can
 * verify "variant prop → variant class" without coupling to the hash. Also
 * accepts a bare `<name>` for the non-scoped strategy.
 *
 * This is the one sanctioned exception to "prefer role/text over class names":
 * for a primitive whose whole job is mapping a prop to a style variant, the
 * variant class IS the behaviour, and an undefined `styles[variant]` (renamed
 * or typo'd CSS class) is a silent regression nothing else catches.
 */
export function hasLocalClass(el: Element | null | undefined, name: string): boolean {
  const classes = (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  const scoped = new RegExp(`^_${name}_`);
  return classes.some((c) => c === name || scoped.test(c));
}
