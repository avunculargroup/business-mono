// Deterministic-before-LLM: the house rules that can be checked mechanically are
// checked mechanically, BEFORE Lex is ever invoked. Cheaper, non-negotiable, no
// tokens. Everything in this file is a pure function.
//
// "pass" = no HARD violations. Warnings surface but don't block: the
// Bitcoin/bitcoin heuristic can't be perfect, so it warns and Lex judges the
// rest. Exclamation marks, Australian spelling, and payload-number provenance
// are unambiguous — they are hard.

import type { Finding } from '@platform/shared';
import type { LintResult } from './schemas.js';

// ── Australian English: common Americanisms to flag. Keep the list tight. ─────
const AMERICANISMS: Array<[RegExp, string]> = [
  [/\b(\w+?)izing\b/gi, '-ising'],
  [/\b(\w+?)ize\b/gi, '-ise'],
  [/\b(\w+?)ization\b/gi, '-isation'],
  [/\bcolor\b/gi, 'colour'],
  [/\bfavor(ite|able)?\b/gi, 'favour…'],
  [/\bbehavior\b/gi, 'behaviour'],
  [/\bcenter\b/gi, 'centre'],
  [/\banalyze\b/gi, 'analyse'],
];
// Words that legitimately end in -ize/-izing (proper nouns, series codes).
const IZE_ALLOWLIST = new Set(['size', 'sizing', 'prize', 'seize', 'capsize']);

// ── Bitcoin vs bitcoin (heuristic assist; Lex catches the rest) ───────────────
function bitcoinCapitalisation(text: string): LintResult['violations'] {
  const violations: LintResult['violations'] = [];

  const networkLower = /\bbitcoin (network|protocol|blockchain)\b/g;
  for (const m of text.matchAll(networkLower)) {
    violations.push({
      rule: 'bitcoin_capitalisation',
      severity: 'warn',
      detail: `"${m[0]}" — network/protocol sense should be capitalised "Bitcoin".`,
    });
  }

  // "Bitcoin" immediately before a price/movement reads as the unit.
  const unitUpper = /(?<!^)(?<!\. )\bBitcoin\s+(?=[-+−]?\d|(?:fell|rose|dropped|gained|was (?:up|down)))/gm;
  for (const m of text.matchAll(unitUpper)) {
    void m;
    violations.push({
      rule: 'bitcoin_capitalisation',
      severity: 'warn',
      detail: `"Bitcoin" before a price/movement reads as the unit — likely lower-case "bitcoin".`,
    });
  }
  return violations;
}

function noExclamation(text: string): LintResult['violations'] {
  if (!text.includes('!')) return [];
  return [
    {
      rule: 'no_exclamation',
      severity: 'hard',
      detail: 'Exclamation mark present. House style forbids exclamation marks in copy.',
    },
  ];
}

function australianSpelling(text: string): LintResult['violations'] {
  const violations: LintResult['violations'] = [];
  for (const [re, fix] of AMERICANISMS) {
    for (const m of text.matchAll(re)) {
      if (IZE_ALLOWLIST.has(m[0].toLowerCase())) continue;
      violations.push({
        rule: 'australian_english',
        severity: 'hard',
        detail: `"${m[0]}" → Australian spelling (${fix}).`,
      });
    }
  }
  return violations;
}

// ── Payload-only numbers (hard) — the anti-hallucination guard ────────────────
// Every SALIENT number in the prose (percentages and decimals) must trace to a
// number in the finding payload. Bare small integers are exempt: they are almost
// always period counts ("three weeks", "14-day") already covered by
// persistence_periods, dates, or list counts — not claimed measurements.
//
// The email formatters emit en-AU formatting: thousands separators ("1,234.5")
// and the typographic minus ("−8%"), so both are normalised before parsing.

function normaliseNumberText(raw: string): number {
  return parseFloat(raw.replace(/,/g, '').replace(/−/g, '-').replace('%', '').trim());
}

export function extractSalientNumbers(text: string): number[] {
  const out: number[] = [];
  // Percentages, signed, with optional separators/decimals: "−8%", "+1.1 %", "12,000.5%".
  for (const m of text.matchAll(/[-+−]?[\d,]*\d\.?\d*\s?%/g)) {
    out.push(normaliseNumberText(m[0]));
  }
  // Decimals, signed, with optional thousands separators: "1,234.56", "−2.2".
  for (const m of text.matchAll(/[-+−]?[\d,]*\d\.\d+(?!\s?%)/g)) {
    out.push(normaliseNumberText(m[0]));
  }
  return out.filter((n) => Number.isFinite(n));
}

export function payloadNumbers(findings: Finding[]): number[] {
  const nums: number[] = [];
  for (const f of findings) {
    nums.push(f.observed, f.unusualness, f.magnitude_norm, f.persistence_periods);
    nums.push(f.baseline.mean, f.baseline.sd, f.baseline.p05, f.baseline.p50, f.baseline.p95);
    // Numbers embedded in the narration-hint strings (e.g. "−2.2%").
    for (const s of [f.narration_hint.means, f.narration_hint.noise_note ?? '']) {
      for (const m of s.matchAll(/[-+−]?[\d,]*\d\.?\d*/g)) {
        const n = normaliseNumberText(m[0]);
        if (Number.isFinite(n)) nums.push(n);
      }
    }
  }
  return nums;
}

function numbersInPayload(text: string, findings: Finding[], tol = 0.05): LintResult['violations'] {
  const violations: LintResult['violations'] = [];
  const allowed = payloadNumbers(findings);
  for (const n of extractSalientNumbers(text)) {
    const ok = allowed.some((a) => {
      const scale = Math.max(Math.abs(a), 1);
      // A narrated figure may be the magnitude of a signed payload value
      // ("fell 8%" for observed = -8), so compare magnitudes too.
      return Math.abs(a - n) <= tol * scale || Math.abs(Math.abs(a) - Math.abs(n)) <= tol * scale;
    });
    if (!ok) {
      violations.push({
        rule: 'payload_only_numbers',
        severity: 'hard',
        detail: `The figure ${n} does not trace to any finding payload value.`,
      });
    }
  }
  return violations;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function runHouseStyle(text: string, findings: Finding[]): LintResult {
  const violations = [
    ...noExclamation(text),
    ...australianSpelling(text),
    ...bitcoinCapitalisation(text),
    ...numbersInPayload(text, findings),
  ];
  const pass = !violations.some((v) => v.severity === 'hard');
  return { pass, violations };
}

/** Compact violation summary the narrator is re-prompted with on the corrective pass. */
export function summariseViolations(violations: LintResult['violations']): string {
  return violations.map((v) => `- [${v.severity}] ${v.rule}: ${v.detail}`).join('\n');
}
