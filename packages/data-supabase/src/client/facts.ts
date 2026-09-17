import type {
  AbsentFact,
  ComplianceClass,
  Fact,
  ReadContext,
  ResolvedFacts,
} from '@platform/data';
import { requireDisclosure, type ClientAdapterContext } from './context';

/**
 * The fact registry.
 *
 * Assumption A6 in the spec bundle asks for the available keys to be enumerated
 * before templates are written against them, and for missing facts to be a
 * backlog rather than a blocker. This is that enumeration: an explicit map from
 * the stable fact key a template binds to the indicator row behind it.
 *
 * Explicit rather than derived, for two reasons. A template referencing
 * `btc_spot_aud` should keep working when the series behind it is re-sourced,
 * which means the key cannot be the provider's. And a fact reaching a board
 * paper should be a decision someone made once, not whatever happened to be in
 * the indicators table that morning.
 *
 * `complianceClass` is declared here because no indicator table carries one.
 * Only `neutral` and `valuation_adjacent` facts are servable at all — an
 * `advice_adjacent` or `solvency_adjacent` fact would need the Lex gate that
 * `ecosystem_changes` has and indicators do not, so rather than serve one
 * ungated, the registry cannot express it. That is the type system doing the
 * work again.
 */
export interface FactSource {
  /** Which indicator table holds it. */
  kind: 'onchain' | 'macro';
  /** `onchain_indicators.key`, or `economic_indicators.provider_series_code`. */
  ref: string;
  label: string;
  basis: Fact['basis'];
  complianceClass: Extract<ComplianceClass, 'neutral' | 'valuation_adjacent'>;
  expectedCadenceDays: number;
}

export const FACT_SOURCES: Readonly<Record<string, FactSource>> = Object.freeze({
  btc_spot_aud: {
    kind: 'onchain',
    ref: 'btc_price_aud',
    label: 'Bitcoin spot price (AUD)',
    basis: 'observed',
    complianceClass: 'valuation_adjacent',
    expectedCadenceDays: 1,
  },
  btc_spot_usd: {
    kind: 'onchain',
    ref: 'btc_price_usd',
    label: 'Bitcoin spot price (USD)',
    basis: 'observed',
    complianceClass: 'valuation_adjacent',
    expectedCadenceDays: 1,
  },
  btc_realised_vol_90d: {
    kind: 'onchain',
    ref: 'realised_vol_90d',
    label: 'Realised volatility, 90 day',
    basis: 'derived',
    complianceClass: 'valuation_adjacent',
    expectedCadenceDays: 1,
  },
  au_cpi_annual: {
    kind: 'macro',
    ref: 'AU_CPI_ANNUAL',
    label: 'Australian CPI, annual',
    basis: 'reported',
    complianceClass: 'neutral',
    expectedCadenceDays: 92,
  },
  au_cash_rate: {
    kind: 'macro',
    ref: 'AU_CASH_RATE',
    label: 'RBA cash rate target',
    basis: 'reported',
    complianceClass: 'neutral',
    expectedCadenceDays: 35,
  },
});

/** Keys a template may bind. Validation rejects anything outside this set. */
export const KNOWN_FACT_KEYS: readonly string[] = Object.freeze(Object.keys(FACT_SOURCES));

type ObservationRow = {
  value: number | null;
  at: string | null;
  decimals: number | null;
  unit: string | null;
  provider: string | null;
  label: string | null;
};

/**
 * Formats a value for display, once, here.
 *
 * The single place a number becomes a string. Everything downstream receives
 * the string, so no component and no template can reformat, round, or do
 * arithmetic on it — which is the whole reason `Fact.value` is typed the way it
 * is.
 */
function format(value: number, decimals: number | null, unit: string | null): string {
  const digits = decimals ?? 2;
  const formatted = new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  return unit === '%' ? `${formatted}%` : formatted;
}

async function readOnchain(
  adapter: ClientAdapterContext,
  refs: string[],
): Promise<Map<string, ObservationRow>> {
  const out = new Map<string, ObservationRow>();
  if (refs.length === 0) return out;

  const { data, error } = await adapter.client
    .from('onchain_indicators')
    .select(
      'key, name, short_label, unit, decimals, provider, onchain_observations(value, observed_at, is_current)',
    )
    .in('key', refs);

  if (error) throw error;

  for (const row of data ?? []) {
    const observations = (row.onchain_observations ?? []) as Array<{
      value: number | null;
      observed_at: string | null;
      is_current: boolean | null;
    }>;
    const current = observations.filter((o) => o.is_current).at(0) ?? observations.at(0);
    if (!current || current.value === null || !row.key) continue;

    out.set(row.key, {
      value: current.value,
      at: current.observed_at,
      decimals: row.decimals,
      unit: row.unit,
      provider: row.provider,
      label: row.short_label ?? row.name,
    });
  }

  return out;
}

async function readMacro(
  adapter: ClientAdapterContext,
  refs: string[],
): Promise<Map<string, ObservationRow>> {
  const out = new Map<string, ObservationRow>();
  if (refs.length === 0) return out;

  const { data, error } = await adapter.client
    .from('economic_indicators')
    .select(
      'provider_series_code, name, short_label, unit, decimals, provider, indicator_observations(value, period_date, is_current)',
    )
    .in('provider_series_code', refs);

  if (error) throw error;

  for (const row of data ?? []) {
    const observations = (row.indicator_observations ?? []) as Array<{
      value: number | null;
      period_date: string | null;
      is_current: boolean | null;
    }>;
    const current = observations.filter((o) => o.is_current).at(0) ?? observations.at(0);
    if (!current || current.value === null || !row.provider_series_code) continue;

    out.set(row.provider_series_code, {
      value: current.value,
      at: current.period_date,
      decimals: row.decimals,
      unit: row.unit,
      provider: row.provider,
      label: row.short_label ?? row.name,
    });
  }

  return out;
}

/**
 * Resolves fact keys to facts, and everything else to stated absences.
 *
 * Never throws on an unknown key and never silently drops one. A template
 * asking for a fact that is not available gets an `AbsentFact` back and renders
 * "not available as at this date", because absence is a fact — the same rule
 * the register and the signals feed already run on.
 */
export async function resolveFacts(
  adapter: ClientAdapterContext,
  ctx: ReadContext,
  keys: string[],
): Promise<ResolvedFacts> {
  await requireDisclosure(adapter);

  const resolvedAt = ctx.asOf.toISOString();
  // An empty request means "everything servable", which is what the conformance
  // suite leans on to check every fact's value type without knowing the keys.
  const wanted = keys.length > 0 ? [...new Set(keys)] : [...KNOWN_FACT_KEYS];

  const known = wanted.filter((key) => key in FACT_SOURCES);
  const unknown = wanted.filter((key) => !(key in FACT_SOURCES));

  const onchainRefs = known
    .filter((key) => FACT_SOURCES[key]!.kind === 'onchain')
    .map((key) => FACT_SOURCES[key]!.ref);
  const macroRefs = known
    .filter((key) => FACT_SOURCES[key]!.kind === 'macro')
    .map((key) => FACT_SOURCES[key]!.ref);

  const [onchain, macro] = await Promise.all([
    readOnchain(adapter, onchainRefs),
    readMacro(adapter, macroRefs),
  ]);

  const facts: Fact[] = [];
  const absent: AbsentFact[] = unknown.map((key) => ({
    key,
    // No label to give: the key is not in the registry, so nothing is known
    // about it beyond what was asked for.
    label: key,
    reason: 'not_cleared' as const,
    asAt: resolvedAt,
  }));

  for (const key of known) {
    const source = FACT_SOURCES[key]!;
    const row = (source.kind === 'onchain' ? onchain : macro).get(source.ref);

    if (!row || row.at === null) {
      absent.push({
        key,
        label: source.label,
        // The key is known and the series is not answering. That is a different
        // absence from an uncleared key and the pack says so.
        reason: row ? 'no_data' : 'source_unavailable',
        asAt: resolvedAt,
      });
      continue;
    }

    facts.push({
      key,
      label: source.label,
      value: format(row.value ?? 0, row.decimals, row.unit),
      unit: row.unit ?? undefined,
      asAt: row.at,
      sourceName: row.provider ?? 'Bitcoin Treasury Solutions',
      basis: source.basis,
      complianceClass: source.complianceClass,
      expectedCadenceDays: source.expectedCadenceDays,
    });
  }

  return { facts, absent, resolvedAt };
}
