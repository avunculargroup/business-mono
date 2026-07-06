/**
 * Market-report intro commentary — the one LLM touch in an otherwise
 * deterministic routine.
 *
 * After runMarketReport assembles the day's Bitcoin / On-chain / Macro sections,
 * this step pulls several days of recent history for each metric (from the same
 * v_onchain_series / v_indicator_series views the web dashboard sparklines use),
 * hands both the snapshot and the trend to the internal `marketAnalyst` agent,
 * and gets back a ≤50-word intro on what changed and why it matters.
 *
 * Best-effort throughout: a history-fetch or generation failure returns null so
 * the report still sends without an intro — an LLM hiccup must never sink the
 * routine.
 */

import { z } from 'zod';
import { supabase } from '@platform/db';
import type { MarketReportSection } from '@platform/shared';
import { marketAnalyst } from '../../agents/marketAnalyst/index.js';

// Recent history kept per metric, keyed by the metric's short label (the same
// label the report sections carry), oldest → latest.
export type HistoryMap = Record<string, number[]>;

// On-chain / Bitcoin metrics are daily — keep ~7 points so the analyst always
// has at least five days of trend. Macro prints are weekly/monthly, so a day
// window would be empty; keep the last ~5 prints instead.
const ONCHAIN_HISTORY_POINTS = 7;
const MACRO_HISTORY_POINTS = 5;
const ONCHAIN_LOOKBACK_DAYS = 14;
const MACRO_LOOKBACK_DAYS = 400;

// A response longer than this many words is treated as a miss and dropped rather
// than truncated mid-sentence (the intro is best-effort).
const MAX_COMMENTARY_WORDS = 70;

const commentarySchema = z.object({
  commentary: z.string().describe('The market report intro — one tight paragraph, at most ~50 words.'),
});

function daysAgoISO(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

function groupTail(
  rows: { short_label: string | null; value: number | null }[],
  keep: number,
): HistoryMap {
  // Rows arrive oldest → latest; push in order, then keep the last `keep`.
  const byLabel: HistoryMap = {};
  for (const row of rows) {
    if (row.short_label == null || row.value == null) continue;
    (byLabel[row.short_label] ??= []).push(Number(row.value));
  }
  for (const label of Object.keys(byLabel)) {
    byLabel[label] = byLabel[label].slice(-keep);
  }
  return byLabel;
}

/**
 * Recent per-metric history for the on-chain/Bitcoin and macro indicators.
 * Reads the existing series views; returns {} on any error (best-effort).
 */
export async function loadIndicatorHistory(now: Date = new Date()): Promise<HistoryMap> {
  try {
    const [onchainRes, macroRes] = await Promise.all([
      supabase
        .from('v_onchain_series')
        .select('short_label, value, observed_at')
        .gte('observed_at', daysAgoISO(now, ONCHAIN_LOOKBACK_DAYS))
        .order('observed_at', { ascending: true }),
      supabase
        .from('v_indicator_series')
        .select('short_label, value, period_date')
        .gte('period_date', daysAgoISO(now, MACRO_LOOKBACK_DAYS))
        .order('period_date', { ascending: true }),
    ]);

    const onchain = groupTail(
      (onchainRes.data ?? []) as { short_label: string | null; value: number | null }[],
      ONCHAIN_HISTORY_POINTS,
    );
    const macro = groupTail(
      (macroRes.data ?? []) as { short_label: string | null; value: number | null }[],
      MACRO_HISTORY_POINTS,
    );
    return { ...onchain, ...macro };
  } catch {
    return {};
  }
}

function fmtSeriesNumber(value: number): string {
  return value.toLocaleString('en-AU', { maximumFractionDigits: 2 });
}

/**
 * Build the analyst's user prompt from the assembled sections and the recent
 * history. Pure and exported so the prompt shape is unit-testable.
 */
export function buildCommentaryPrompt(
  sections: MarketReportSection[],
  history: HistoryMap,
): string {
  const lines: string[] = [];
  for (const section of sections) {
    lines.push(`## ${section.heading}`);
    for (const it of section.items) {
      const bits = [it.value, it.signal ? `[${it.signal}]` : '', it.delta ?? ''].filter(Boolean);
      lines.push(`- ${it.label}: ${bits.join('  ')}`);
      const series = history[it.label];
      if (series && series.length >= 2) {
        lines.push(`    recent (oldest→latest): ${series.map(fmtSeriesNumber).join(' → ')}`);
      }
    }
  }

  return (
    `Today's market report figures follow. Each metric line shows the current value, any state ` +
    `chip in [brackets], and the one-day change; where available, an indented "recent" line gives ` +
    `the last several days/periods (oldest→latest) so you can read the trend.\n\n` +
    `<data>\n${lines.join('\n')}\n</data>\n\n` +
    `Write the intro now: analyse the changing conditions over the last few days, pick one or two ` +
    `aspects worth focusing on (do not recap every metric), 50 words maximum.`
  );
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Generate the ≤50-word market-report intro. Returns null (no intro) on empty
 * sections, an over-length response, or any error — the report sends regardless.
 */
export async function generateMarketCommentary(
  sections: MarketReportSection[],
  now: Date = new Date(),
): Promise<string | null> {
  if (sections.length === 0) return null;
  try {
    const history = await loadIndicatorHistory(now);
    const prompt = buildCommentaryPrompt(sections, history);
    const response = await marketAnalyst.generate([{ role: 'user', content: prompt }], {
      structuredOutput: {
        schema: commentarySchema,
        errorStrategy: 'fallback',
        fallbackValue: { commentary: '' },
      },
    });
    const text = ((response.object as { commentary?: string } | undefined)?.commentary ?? '').trim();
    if (!text) return null;
    if (countWords(text) > MAX_COMMENTARY_WORDS) return null;
    return text;
  } catch {
    return null;
  }
}
