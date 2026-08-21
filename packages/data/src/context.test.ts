import { describe, expect, it } from 'vitest';
import { READ_CONTEXT_KEYS, READ_CONTEXT_KEYS_ARE_EXHAUSTIVE } from './context';

describe('the scoping rule', () => {
  // Scoping belongs at bundle construction, never in a method signature — and
  // `ReadContext` is the one place that rule could be broken while every
  // signature still looked compliant, because it is threaded through every read
  // in the app. See docs/features/demo-app/repository-contract.md.
  //
  // This is the runtime half of a two-lock guard. Adding a field to
  // `ReadContext` fails `tsc` on READ_CONTEXT_KEYS_ARE_EXHAUSTIVE; widening
  // READ_CONTEXT_KEYS to make `tsc` pass again fails here. Breaking the rule
  // means defeating both, which cannot happen by accident.
  it('keeps ReadContext to asOf and nothing else', () => {
    expect(READ_CONTEXT_KEYS).toEqual(['asOf']);
  });

  it('holds the compile-time guard that pairs with it', () => {
    // Its *value* is trivial; its type is the assertion. This case exists so the
    // constant cannot be deleted as unused without a red test pointing at why.
    expect(READ_CONTEXT_KEYS_ARE_EXHAUSTIVE).toBe(true);
  });
});
