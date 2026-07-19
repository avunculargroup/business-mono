// Zod mirrors of the shared finding shapes (@platform/shared findings.ts), used
// for the narrator's structured output and for validating persisted JSONB.
// Spec: docs/features/findings-engine-spec.md §Spec 1.

import { z } from 'zod';
import type { Finding, Selection } from '@platform/shared';

export const findingTypeSchema = z.enum([
  'anomaly',
  'divergence',
  'inflection',
  'streak',
  'threshold',
  'staleness',
]);

export const complianceClassSchema = z.enum(['informational', 'valuation_sensitive']);

export const findingSchema: z.ZodType<Finding> = z.object({
  id: z.string(),
  finding_type: findingTypeSchema,

  metric_key: z.string(),
  metric_group: z.string(),
  secondary_metric_key: z.string().optional(), // divergence only

  period: z.enum(['day', 'month', 'quarter']),
  as_of: z.string(), // ISO date
  window_days: z.number(),

  observed: z.number(),
  baseline: z.object({
    mean: z.number(),
    sd: z.number(),
    p05: z.number(),
    p50: z.number(),
    p95: z.number(),
  }),
  unusualness: z.number(),
  magnitude_norm: z.number(),
  persistence_periods: z.number(),
  direction: z.enum(['up', 'down', 'flat_break']), // logic only — never mapped to colour

  materiality: z.number(),
  compliance_class: complianceClassSchema,

  allowed_vocab: z.array(z.string()),
  narration_hint: z.object({
    means: z.string(),
    noise_note: z.string().optional(),
    verdict_allowed: z.boolean(),
  }),

  evidence_refs: z.array(z.string()),
});

export const selectionSchema: z.ZodType<Selection> = z.object({
  as_of: z.string(),
  report_mode: z.enum(['normal', 'quiet']),
  findings: z.array(findingSchema),
  ops_findings: z.array(findingSchema),
});

// What the narrator agent returns (structuredOutput).
export const narrationSchema = z.object({
  narration_markdown: z.string(),
  findings_used: z.array(z.string()), // finding ids referenced
});
export type Narration = z.infer<typeof narrationSchema>;

// Deterministic house-style linter result.
export const lintSchema = z.object({
  pass: z.boolean(),
  violations: z.array(
    z.object({
      rule: z.string(),
      severity: z.enum(['hard', 'warn']),
      detail: z.string(),
    }),
  ),
});
export type LintResult = z.infer<typeof lintSchema>;
