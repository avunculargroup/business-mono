/**
 * Adapter contract for ecosystem watches.
 *
 * The single seam every watch type crosses. Adapters fetch and parse only —
 * they never touch the database, never score, never narrate, never decide
 * whether a change is good or bad news. An adapter is a function from
 * (config, last_state) to a set of detected changes plus the next diff anchor,
 * so its parse step is testable against a recorded fixture with no Supabase, no
 * Mastra, and no network.
 *
 * Adapters never throw across the seam: one failing vendor must not abort the
 * sweep. They return a typed result, and the caller records the failure against
 * that watch's health and moves on.
 *
 * Two rules that are load-bearing rather than stylistic:
 *
 *   1. `dedup_key` must be STABLE for the same real-world event. It is the
 *      idempotency guard (UNIQUE on watch_id, dedup_key) — an unstable key
 *      re-reports the same release on every run.
 *   2. When an adapter cannot determine the current state, it returns
 *      `ok: false`, never an empty change set presented as a clean read.
 *      Silence is safe; a confident wrong answer is not.
 *
 * Spec: docs/features/ecosystem/ecosystem-signal-feature.md
 */

import type { EcosystemChangeType } from '@platform/shared';
import type { Json } from '@platform/db';

/** A change an adapter detected, before any scoring, narration or classification. */
export interface DetectedChange {
  changeType: EcosystemChangeType;
  /** Deterministic, payload-derived headline. Never LLM-written. */
  title: string;
  /** The structured facts. The narration contract's only source. */
  payload: Record<string, unknown>;
  /** Stable per real-world event — see rule 1 above. */
  dedupKey: string;
  /** When the change actually happened, ISO 8601. Null when the source has no date. */
  occurredAt: string | null;
  /** Deep link to the release / advisory / incident / page. */
  externalUrl: string | null;
}

export interface EcosystemAdapterError {
  kind: 'transport' | 'parse' | 'not_found' | 'rate_limit' | 'config' | 'indeterminate';
  message: string;
  status?: number;
}

export type EcosystemAdapterResult =
  | {
      ok: true;
      changes: DetectedChange[];
      /** The new diff anchor, persisted to ecosystem_watches.last_state. */
      nextState: Json;
    }
  | { ok: false; error: EcosystemAdapterError };

/** What the adapter is handed off the watch row. */
export interface AdapterInput {
  /** The watch's `config` JSONB, unvalidated — the adapter checks its own shape. */
  config: Record<string, unknown>;
  /** The previous `last_state`, or null on the very first run. */
  lastState: Record<string, unknown> | null;
  /** Run clock, injected so time-dependent adapters (attestation) are testable. */
  now: Date;
}

export interface EcosystemAdapter {
  readonly watchType: string;
  /**
   * On the FIRST run (lastState null) an adapter establishes its anchor and
   * reports NO changes. Everything a vendor has ever published is not news, and
   * a director should not have to dismiss forty historical releases to reach
   * the one that matters. The exception is `attestation`, which is detected by
   * absence and can be overdue the moment it is first observed.
   */
  detect(input: AdapterInput): Promise<EcosystemAdapterResult>;
}

/** Narrow an unknown config value to a non-empty string, or undefined. */
export function configString(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Narrow an unknown config value to a finite number, or undefined. */
export function configNumber(config: Record<string, unknown>, key: string): number | undefined {
  const value = config[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function configBoolean(config: Record<string, unknown>, key: string): boolean {
  return config[key] === true;
}

/** A missing or malformed config field — the watch is misconfigured, not broken. */
export function configError(message: string): EcosystemAdapterResult {
  return { ok: false, error: { kind: 'config', message } };
}
