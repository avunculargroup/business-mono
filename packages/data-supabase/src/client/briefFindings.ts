/**
 * Projecting a stored finding into the Brief's read model.
 *
 * `market_reports.findings` is written by the agent-side findings engine, whose
 * shape is `Finding` in `@platform/shared` — `metric_key`, `observed`,
 * `baseline`, `narration_hint`, `evidence_refs`. It has never carried a
 * headline, a detail or a provenance array. The client adapter used to read
 * those three names straight off the JSON, so every live finding rendered with
 * an empty headline, an empty body and "Source not attached" under a type chip.
 * The subscriber saw the word "streak" and nothing else.
 *
 * So the translation happens here instead, and it is a translation rather than
 * a lookup: the engine's own plain-language `narration_hint.means` becomes the
 * headline, its `noise_note` the detail, its `observed`/`baseline` the evidence
 * rows, and the indicator catalogue behind `metric_key` the provenance. Doing
 * it on the way out rather than at write time means every brief already
 * published becomes legible, which a new column would not have managed.
 *
 * Everything in here is pure. The catalogue is fetched once per bundle by the
 * repository and handed in.
 */
import type { ClientProvenance, Finding, FindingEvidence, FindingType } from '@platform/data';
import { macroMetricKey } from '@platform/shared';

const FINDING_TYPES: readonly FindingType[] = [
  'anomaly',
  'divergence',
  'inflection',
  'streak',
  'threshold',
  'staleness',
];

function toFindingType(value: unknown): FindingType {
  return FINDING_TYPES.includes(value as FindingType) ? (value as FindingType) : 'anomaly';
}

// ── the indicator catalogue ───────────────────────────────────────────────────

/**
 * One series, as the Brief needs to describe it.
 *
 * Keyed by the unified metric key the findings engine uses: an
 * `onchain_indicators.key` as-is, or `macro:<slug>` for an economic indicator
 * (see `macroMetricKey`). The engine coined that namespace; this mirrors it
 * rather than inventing a second one, because two spellings of the same key is
 * how a join quietly matches nothing.
 */
export interface MetricCatalogEntry {
  key: string;
  label: string;
  unit: string | null;
  decimals: number;
  /** Null for a derived series — the schema forbids a derived row a provider. */
  provider: string | null;
  /** FRED series id / RBA table ref, where one exists. Drives the deep link. */
  providerCode: string | null;
  /** Keys this series is computed from. Empty for a fetched series. */
  derivedFrom: string[];
}

export type MetricCatalog = ReadonlyMap<string, MetricCatalogEntry>;

export type OnchainCatalogRow = {
  key?: string | null;
  short_label?: string | null;
  name?: string | null;
  unit?: string | null;
  decimals?: number | null;
  provider?: string | null;
  provider_metric_code?: string | null;
  derivation_spec?: unknown;
};

export type MacroCatalogRow = {
  short_label?: string | null;
  name?: string | null;
  unit?: string | null;
  decimals?: number | null;
  provider?: string | null;
  provider_series_code?: string | null;
  provider_table_ref?: string | null;
};

/**
 * Keys named inside a `derivation_spec`.
 *
 * The specs are documentation rather than an executed formula, so they are not
 * uniform: some carry `source_key`, some `numerator_key`/`denominator_key`,
 * `inputs`, or a `fast`/`slow` pair. Reading every shape that appears is
 * cheaper than a migration normalising them, and an unrecognised shape yields
 * no keys, which degrades to a finding whose source is stated as unattached
 * rather than to a wrong attribution.
 */
function derivationInputs(spec: unknown): string[] {
  if (!spec || typeof spec !== 'object') return [];
  const one = spec as Record<string, unknown>;
  const out: string[] = [];

  for (const field of ['source_key', 'numerator_key', 'denominator_key', 'fast', 'slow', 'denominator']) {
    const value = one[field];
    if (typeof value === 'string') out.push(value);
  }
  if (Array.isArray(one['inputs'])) {
    for (const value of one['inputs']) if (typeof value === 'string') out.push(value);
  }

  return [...new Set(out)];
}

export function buildMetricCatalog(
  onchain: readonly OnchainCatalogRow[],
  macro: readonly MacroCatalogRow[],
): MetricCatalog {
  const catalog = new Map<string, MetricCatalogEntry>();

  for (const row of onchain) {
    if (!row.key) continue;
    catalog.set(row.key, {
      key: row.key,
      label: row.short_label ?? row.name ?? row.key,
      unit: row.unit ?? null,
      decimals: row.decimals ?? 2,
      provider: row.provider ?? null,
      providerCode: row.provider_metric_code ?? null,
      derivedFrom: derivationInputs(row.derivation_spec),
    });
  }

  for (const row of macro) {
    const label = row.short_label ?? row.name;
    if (!label) continue;
    catalog.set(macroMetricKey(label), {
      key: macroMetricKey(label),
      label,
      unit: row.unit ?? null,
      decimals: row.decimals ?? 2,
      provider: row.provider ?? null,
      providerCode: row.provider_series_code ?? row.provider_table_ref ?? null,
      derivedFrom: [],
    });
  }

  return catalog;
}

// ── providers ─────────────────────────────────────────────────────────────────

/**
 * How a provider is named to a subscriber, and where they can go and check.
 *
 * Every fact on every client surface carries a link the reader can follow —
 * the Service Statement says so, and `apps/client/lib/serviceStatement.test.ts`
 * holds the app to it. A provider with no page a reader can usefully land on
 * carries no URL rather than a guessed one: a dead link is worse than a named
 * source, because it looks checkable and is not.
 *
 * Keyed by the provider slugs the two indicator tables' CHECK constraints
 * allow. An unrecognised value is shown as written rather than dropped — the
 * column is TEXT, and a source named oddly still beats no source at all.
 */
const PROVIDERS: Readonly<Record<string, { name: string; url?: string }>> = Object.freeze({
  mempool: { name: 'mempool.space', url: 'https://mempool.space' },
  coinmetrics: { name: 'Coin Metrics', url: 'https://coinmetrics.io/community-network-data/' },
  coingecko: { name: 'CoinGecko', url: 'https://www.coingecko.com/en/coins/bitcoin' },
  alternative_me: {
    name: 'Alternative.me',
    url: 'https://alternative.me/crypto/fear-and-greed-index/',
  },
  bgeometrics: { name: 'BGeometrics', url: 'https://bgeometrics.com' },
  sosovalue: { name: 'SoSoValue', url: 'https://sosovalue.com/assets/etf/us-btc-spot' },
  fred: { name: 'FRED, Federal Reserve Bank of St Louis' },
  rba: { name: 'Reserve Bank of Australia', url: 'https://www.rba.gov.au/statistics/tables/' },
  abs: { name: 'Australian Bureau of Statistics', url: 'https://www.abs.gov.au/statistics' },
  oecd: { name: 'OECD', url: 'https://data-explorer.oecd.org/' },
  stooq: { name: 'Stooq', url: 'https://stooq.com' },
  gold_api: { name: 'gold-api.com' },
});

function providerUrl(slug: string, code: string | null): string | undefined {
  // FRED is the one provider whose series id resolves to a page per series, so
  // it is the one place a deep link is better than a home page.
  if (slug === 'fred' && code) return `https://fred.stlouisfed.org/series/${code}`;
  return PROVIDERS[slug]?.url;
}

/**
 * The fetched series a metric ultimately rests on.
 *
 * A derived metric carries no provider of its own — the Mayer Multiple is a
 * ratio of BTC/USD to its own 200-day average, and the 200-day average is
 * itself derived. Walking the chain is what lets the card say "Coin Metrics"
 * instead of nothing, so it walks rather than giving up at the first hop.
 * Bounded by the visited set, because a mis-seeded spec could name a cycle.
 */
function fetchedRoots(key: string, catalog: MetricCatalog): MetricCatalogEntry[] {
  const roots: MetricCatalogEntry[] = [];
  const seen = new Set<string>();
  const queue = [key];

  while (queue.length > 0) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);

    const entry = catalog.get(next);
    if (!entry) continue;
    if (entry.provider) roots.push(entry);
    else queue.push(...entry.derivedFrom);
  }

  return roots;
}

/**
 * Provenance for one finding.
 *
 * `basis` describes the quantity the card actually states, not the series it
 * came from, and the difference matters. Coin Metrics publishes BTC/USD; it
 * does not publish "fell 3.4% over the day". A rail reading "Coin Metrics, as
 * published" over that sentence would attribute this platform's arithmetic to
 * the provider. So `reported` is claimed only where the observed figure is the
 * series' own published value — a threshold crossing, on a series someone
 * fetched — and everything else is `derived`, which the page renders as
 * "computed from this source".
 */
export function provenanceFor(
  metricKey: string,
  asAt: string,
  catalog: MetricCatalog,
  type: FindingType = 'anomaly',
): ClientProvenance[] {
  const entry = catalog.get(metricKey);
  if (!entry) return [];

  const roots = fetchedRoots(metricKey, catalog);
  const derived = !entry.provider || SHAPES[type].observed !== 'series';

  const seen = new Set<string>();
  const out: ClientProvenance[] = [];

  for (const root of roots) {
    const slug = root.provider!;
    if (seen.has(slug)) continue;
    seen.add(slug);

    const known = PROVIDERS[slug];
    const url = providerUrl(slug, root.providerCode);
    out.push({
      sourceName: known?.name ?? slug,
      ...(url ? { sourceUrl: url } : {}),
      asAt,
      basis: derived ? 'derived' : 'reported',
    });
  }

  return out;
}

// ── evidence ──────────────────────────────────────────────────────────────────

function formatNumber(value: number, decimals: number): string {
  return new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** The two unit spellings that change how a figure reads. Everything else is bare. */
function withUnit(formatted: string, unit: string | null): string {
  return unit === 'percent' || unit === '%' ? `${formatted}%` : formatted;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * What space a finding's figures live in.
 *
 * `observed` is NOT the series' value in general, and that is the one thing in
 * this projection a careless reading gets wrong. Each computor picks whatever
 * quantity suits its own question: an anomaly compares a period-over-period
 * percentage change against the distribution of those changes, a divergence
 * reports a trailing correlation, a streak counts periods held, and only a
 * threshold crossing reports the series' own level. Printing an anomaly's
 * -3.43 in the Mayer Multiple's units would state a ratio where the engine
 * measured a percentage.
 *
 * The invariant that does hold everywhere: `observed` and the `baseline`
 * percentiles are always in the same space as each other, because every
 * computor builds the baseline out of the same quantity it observed. So a card
 * can always show the two side by side; what it must not do is assume which
 * space that is.
 *
 * `bare` is the honest answer where a type has more than one code path —
 * inflection observes a run length, a forecast level, or a moving-average
 * spread, depending on the series. Mirroring its key lists here would put a
 * second copy of the engine's internals in the adapter, and the two would
 * disagree the first time either changed. A figure with no unit reads fine
 * beside its own band; a figure with the wrong unit is a false statement.
 */
type Scale = 'series' | 'percent' | 'correlation' | 'bare';

interface TypeShape {
  /** `count` means a number of periods, which is never a unit of the series. */
  observed: Scale | 'count';
  baseline: Scale;
  observedLabel: string;
  baselineLabel: string;
}

const SHAPES: Readonly<Record<FindingType, TypeShape>> = Object.freeze({
  anomaly: {
    observed: 'percent',
    baseline: 'percent',
    observedLabel: 'Change over the period',
    baselineLabel: 'Usual change',
  },
  divergence: {
    observed: 'correlation',
    baseline: 'correlation',
    observedLabel: 'Correlation',
    baselineLabel: 'Usual correlation',
  },
  inflection: {
    observed: 'bare',
    baseline: 'bare',
    observedLabel: 'Observed',
    baselineLabel: 'Usual range',
  },
  streak: {
    observed: 'count',
    baseline: 'series',
    observedLabel: 'Held for',
    baselineLabel: 'Usual range',
  },
  threshold: {
    observed: 'series',
    baseline: 'series',
    observedLabel: 'Observed',
    baselineLabel: 'Usual range',
  },
  staleness: {
    observed: 'count',
    baseline: 'bare',
    observedLabel: 'Periods without a print',
    baselineLabel: 'Usual range',
  },
});

type Baseline = { p05?: unknown; p50?: unknown; p95?: unknown };

function render(value: number, scale: Scale, entry: MetricCatalogEntry | undefined): string {
  switch (scale) {
    case 'series':
      return withUnit(formatNumber(value, entry?.decimals ?? 2), entry?.unit ?? null);
    case 'percent':
      // One decimal, the precision the engine's own narration hint states the
      // same figure to.
      return `${formatNumber(value, 1)}%`;
    case 'correlation':
      return formatNumber(value, 2);
    case 'bare':
      return formatNumber(value, entry?.decimals ?? 2);
  }
}

const DAYS_PER_PERIOD: Readonly<Record<string, number>> = { month: 30, quarter: 91 };

function windowLabel(windowDays: unknown, period: string): string {
  if (!isFiniteNumber(windowDays) || windowDays <= 0) return '';

  const perPeriod = DAYS_PER_PERIOD[period];
  if (!perPeriod) return ` (${formatNumber(windowDays, 0)}d)`;

  const periods = Math.round(windowDays / perPeriod);
  return ` (${periods} ${period}${periods === 1 ? '' : 's'})`;
}

export function evidenceFor(
  raw: Record<string, unknown>,
  type: FindingType,
  entry: MetricCatalogEntry | undefined,
): FindingEvidence[] {
  const shape = SHAPES[type];
  const rows: FindingEvidence[] = [];

  const observed = raw['observed'];
  const period = typeof raw['period'] === 'string' ? raw['period'] : 'day';

  if (isFiniteNumber(observed)) {
    if (shape.observed === 'count') {
      const periodWord = `${period}${observed === 1 ? '' : 's'}`;
      rows.push({
        label: shape.observedLabel,
        value: `${formatNumber(observed, 0)} ${type === 'streak' ? 'consecutive ' : ''}${periodWord}`,
      });
    } else {
      rows.push({
        label: type === 'anomaly' ? `Change over the ${period}` : shape.observedLabel,
        value: render(observed, shape.observed, entry),
      });
    }
  }

  const baseline = (raw['baseline'] ?? {}) as Baseline;
  // The window is what makes "usual" mean anything, so it rides in the label
  // rather than taking a row of its own — in the finding's own periods, since
  // a monthly series judged over two years reads as "730d" otherwise.
  const over = windowLabel(raw['window_days'], period);

  if (isFiniteNumber(baseline.p05) && isFiniteNumber(baseline.p95)) {
    rows.push({
      label: `${shape.baselineLabel}${over}`,
      value: `${render(baseline.p05, shape.baseline, entry)} to ${render(baseline.p95, shape.baseline, entry)}`,
    });
  }
  if (isFiniteNumber(baseline.p50)) {
    rows.push({ label: `Median${over}`, value: render(baseline.p50, shape.baseline, entry) });
  }

  return rows;
}

// ── the projection ────────────────────────────────────────────────────────────

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * The engine writes `noise_note` as a fragment — "the persistence is the story,
 * not the level" — because it is composed into a narration prompt rather than
 * read. On a card it is a sentence of its own, and house style is sentence
 * case with a full stop. Punctuation only: no word is changed, so nothing here
 * can alter what the finding claims.
 */
function asSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return '';

  const opened = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(opened) ? opened : `${opened}.`;
}

/**
 * Turns one stored finding into the read model.
 *
 * `reportAsOf` is the report's own date, used only where the finding carries
 * no observation date of its own. The two differ routinely — a report published
 * on the 17th narrates an observation from the 16th — and the rail says "as at"
 * about the observation, so the finding's date wins where it exists. It is
 * spelled `as_of` in the stored shape; reading only `as_at` is why the rail
 * used to print the publication date.
 */
export function toClientFinding(
  item: unknown,
  index: number,
  reportId: string,
  reportAsOf: string,
  catalog: MetricCatalog,
): Finding {
  const raw = (item ?? {}) as Record<string, unknown>;
  const type = toFindingType(raw['finding_type'] ?? raw['findingType']);
  const metricKey = asString(raw['metric_key'] ?? raw['metricKey']);
  const entry = catalog.get(metricKey);

  const hint = (raw['narration_hint'] ?? {}) as Record<string, unknown>;
  const asAt =
    asString(raw['as_of']) || asString(raw['as_at']) || asString(raw['asAt']) || reportAsOf;

  // A stored headline wins where one exists: nothing writes one today, and a
  // projection that ignored one would quietly discard an author's words if
  // anything ever did.
  const headline = asString(raw['headline']) || asString(hint['means']);
  const detail = asSentence(asString(raw['detail']) || asString(hint['noise_note']));

  const stored = Array.isArray(raw['provenance'])
    ? (raw['provenance'] as Array<Record<string, unknown>>)
    : [];

  const provenance: ClientProvenance[] = stored.length
    ? stored.map((p) => ({
        sourceName: asString(p['source_name'] ?? p['sourceName']) || 'Unattributed',
        ...(typeof (p['source_url'] ?? p['sourceUrl']) === 'string'
          ? { sourceUrl: String(p['source_url'] ?? p['sourceUrl']) }
          : {}),
        asAt: asString(p['as_at'] ?? p['asAt']) || asAt,
        basis: 'reported' as const,
      }))
    : provenanceFor(metricKey, asAt, catalog, type);

  return {
    id: asString(raw['id']) || `${reportId}-${index}`,
    findingType: type,
    headline,
    detail,
    evidence: evidenceFor(raw, type, entry),
    asAt,
    provenance,
  };
}
