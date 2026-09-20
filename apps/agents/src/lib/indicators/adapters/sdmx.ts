/**
 * SDMX-JSON parsing — shared by the ABS and OECD adapters.
 *
 * Both providers speak SDMX, the statistical-exchange standard, and its JSON
 * encoding is index-keyed rather than self-describing: a dataset holds bare
 * numbers under integer keys, and the labels those keys mean live in a separate
 * `structure` block you cross-reference by position. So
 *
 *   dataSets[0].series["0:0:0"].observations["5"] = [98.6, 0, null]
 *
 * means "the 6th time period of the series at position 0:0:0 is 98.6", and the
 * 6th time period is `structure.dimensions.observation[t].values[5].id`. Nothing
 * in the payload says `2026-Q1` next to `98.6`.
 *
 * Two encodings are in the wild and this parses both, because they are versions
 * of one published standard rather than per-provider quirks:
 *
 * - **SDMX-JSON 1.0** — a single `structure` object. What the ABS Data API
 *   returns today.
 * - **SDMX-JSON 2.0** — `structures: [...]`, an array. What OECD's current data
 *   explorer returns, and where ABS is heading.
 *
 * And two dataset shapes: series-nested (`dataSets[0].series`) and flat
 * (`dataSets[0].observations`), the latter used when a query pins every
 * dimension.
 *
 * **This was not verified against a live response.** There is no network egress
 * from the environment it was written in — `data.api.abs.gov.au` is refused at
 * the proxy — and the same was true of `goldApi.ts`. So it follows that file's
 * rule: parse strictly, fail loudly with a slice of the real body attached, and
 * never infer a shape. Every failure path below carries enough of the payload
 * to correct this file from one `agent_activity` row, which is the whole reason
 * the AU CPI and AU Business Confidence rows stay `is_active = false` until
 * someone has run it once.
 *
 * See docs/features/economic-indicators/adapter-contract.md.
 */

import type { AdapterResult, PeriodGranularity, RawObservation } from '../types.js';
import { parseSdmxTimePeriod } from '../period.js';

/** How much of an unexpected payload to quote back. Enough to identify the
 *  shape, short enough to sit in an `agent_activity.notes` cell. */
const BODY_SNIPPET = 400;

interface SdmxDimensionValue {
  id?: string;
  name?: string;
}

interface SdmxDimension {
  id?: string;
  name?: string;
  values?: SdmxDimensionValue[];
}

interface SdmxSeries {
  observations?: Record<string, unknown[]>;
}

interface SdmxDataSet {
  series?: Record<string, SdmxSeries>;
  observations?: Record<string, unknown[]>;
}

function snippet(payload: unknown): string {
  try {
    return JSON.stringify(payload).slice(0, BODY_SNIPPET);
  } catch {
    return String(payload).slice(0, BODY_SNIPPET);
  }
}

function parseError(message: string, payload: unknown): AdapterResult {
  return { ok: false, error: { kind: 'parse', message: `${message}: ${snippet(payload)}` } };
}

/**
 * The structure block, from either encoding.
 *
 * 1.0 puts one object at `structure`; 2.0 an array at `structures`. A payload
 * carrying neither is not an SDMX data message — most likely an error document
 * served with a 200, which is exactly the case worth naming rather than
 * treating as "no observations".
 */
function findStructure(payload: unknown): Record<string, unknown> | null {
  const root = payload as { structure?: unknown; structures?: unknown };
  if (root?.structure && typeof root.structure === 'object') {
    return root.structure as Record<string, unknown>;
  }
  if (Array.isArray(root?.structures) && root.structures.length > 0) {
    const first = root.structures[0];
    if (first && typeof first === 'object') return first as Record<string, unknown>;
  }
  return null;
}

/**
 * The time dimension's values, in index order.
 *
 * Prefers the dimension literally called `TIME_PERIOD`; falls back to the sole
 * observation dimension when there is exactly one, because that is what it must
 * be. Two unnamed observation dimensions is ambiguous and says so.
 */
function findTimeValues(
  structure: Record<string, unknown>,
): { values: SdmxDimensionValue[] } | { error: string } {
  const dimensions = structure['dimensions'] as { observation?: unknown } | undefined;
  const observation = dimensions?.observation;

  if (!Array.isArray(observation) || observation.length === 0) {
    return { error: 'SDMX structure carries no observation dimension' };
  }

  const dims = observation as SdmxDimension[];
  const named = dims.find((dim) => dim.id === 'TIME_PERIOD');
  const chosen = named ?? (dims.length === 1 ? dims[0] : undefined);

  if (!chosen) {
    return {
      error:
        'SDMX structure has several observation dimensions and none is TIME_PERIOD ('
        + dims.map((dim) => dim.id ?? '?').join(', ')
        + ')',
    };
  }
  if (!Array.isArray(chosen.values) || chosen.values.length === 0) {
    return { error: `SDMX time dimension ${chosen.id ?? '?'} carries no values` };
  }

  return { values: chosen.values };
}

/**
 * The observation map, and how to read a time index out of its keys.
 *
 * Series-nested: one entry per series, keyed by observation index alone.
 * Flat: one entry per observation, keyed by every dimension, time last.
 *
 * More than one series means the query did not pin the series down — a dataflow
 * requested with no data key returns all of them. Picking one would be a guess
 * about which series the indicator meant, and the whole point of the registry's
 * `provider_table_ref` is that somebody already decided. So it refuses, and the
 * message names the count and the keys, which is what tells you the data key
 * needs writing.
 */
function findObservations(
  payload: unknown,
): { observations: Record<string, unknown[]>; keyed: 'obs' | 'full' } | { error: string } {
  const dataSets = (payload as { dataSets?: unknown })?.dataSets;
  if (!Array.isArray(dataSets) || dataSets.length === 0) {
    return { error: 'SDMX payload carries no dataSets' };
  }

  const dataSet = dataSets[0] as SdmxDataSet;

  if (dataSet?.series && typeof dataSet.series === 'object') {
    const keys = Object.keys(dataSet.series);
    if (keys.length === 0) return { error: 'SDMX dataSet carries an empty series map' };
    if (keys.length > 1) {
      return {
        error:
          `SDMX query returned ${keys.length} series where one was expected `
          + `(${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ', …' : ''}). `
          + 'The indicator\'s provider_table_ref needs a data key that pins a single series.',
      };
    }
    const series = dataSet.series[keys[0]!];
    if (!series?.observations || typeof series.observations !== 'object') {
      return { error: `SDMX series ${keys[0]} carries no observations` };
    }
    return { observations: series.observations, keyed: 'obs' };
  }

  if (dataSet?.observations && typeof dataSet.observations === 'object') {
    return { observations: dataSet.observations, keyed: 'full' };
  }

  return { error: 'SDMX dataSet carries neither series nor observations' };
}

/**
 * Parses an SDMX-JSON data message into normalised observations.
 *
 * Pure — no network, no database. Exported so the fixture tests can drive it
 * directly, same as every other adapter's parse step.
 */
export function parseSdmxResponse(
  payload: unknown,
  granularity: PeriodGranularity = 'monthly',
  provider = 'SDMX',
): AdapterResult {
  const structure = findStructure(payload);
  if (!structure) {
    return parseError(`${provider}: response is not an SDMX data message`, payload);
  }

  const time = findTimeValues(structure);
  if ('error' in time) return parseError(`${provider}: ${time.error}`, payload);

  const found = findObservations(payload);
  if ('error' in found) return parseError(`${provider}: ${found.error}`, payload);

  const out: RawObservation[] = [];

  for (const [key, cell] of Object.entries(found.observations)) {
    // Flat keys carry every dimension, time last; series keys are the time
    // index alone.
    const timeIndexRaw = found.keyed === 'full' ? key.split(':').at(-1) : key;
    const timeIndex = Number(timeIndexRaw);
    if (!Number.isInteger(timeIndex) || timeIndex < 0) {
      return parseError(`${provider}: observation key "${key}" is not an index`, payload);
    }

    const period = time.values[timeIndex];
    if (!period?.id) {
      return parseError(
        `${provider}: observation ${key} points at time index ${timeIndex}, `
        + `which the structure does not define (${time.values.length} periods)`,
        payload,
      );
    }

    const periodDate = parseSdmxTimePeriod(period.id, granularity);
    if (!periodDate) {
      return parseError(`${provider}: unrecognised TIME_PERIOD "${period.id}"`, payload);
    }

    // The observation cell is an array whose first element is the figure; the
    // rest are attribute indexes. A null figure is a real SDMX state — the
    // period exists and the value is suppressed or not yet published — so it is
    // skipped rather than failed, the same way FRED's "." rows are.
    if (!Array.isArray(cell)) {
      return parseError(`${provider}: observation ${key} is not an array`, payload);
    }
    const raw = cell[0];
    if (raw === null || raw === undefined) continue;

    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value)) {
      return parseError(`${provider}: non-numeric value "${String(raw)}" at ${period.id}`, payload);
    }

    out.push({
      periodDate,
      value,
      // Same as every other adapter in v1: the workflow supplies the fetch date.
      releasedAt: null,
      raw: { timePeriod: period.id, observation: cell },
    });
  }

  out.sort((a, b) => a.periodDate.localeCompare(b.periodDate));
  return { ok: true, observations: out };
}

/**
 * Splits a `provider_table_ref` into the dataflow and the data key.
 *
 * The grammar is `"{dataflow}/{dataKey}"`, spaces around the slash ignored, the
 * key optional. It was chosen to read the rows already seeded:
 * `'DSD_STES@DF_CLI / AUS.M.BCICP...AA'` parses as written, and `'CPI'` parses
 * as a dataflow with no key — which is a request for every series in the
 * dataflow, and is why `findObservations` refuses a multi-series answer with a
 * message naming this function.
 */
export function parseDataflowRef(ref: string): { dataflow: string; dataKey: string | null } {
  const slash = ref.indexOf('/');
  if (slash === -1) return { dataflow: ref.trim(), dataKey: null };

  const dataflow = ref.slice(0, slash).trim();
  const dataKey = ref.slice(slash + 1).trim();
  return { dataflow, dataKey: dataKey.length > 0 ? dataKey : null };
}

/** Shared fetch-and-parse, so ABS and OECD differ only in how they build a URL. */
export async function fetchSdmx(
  url: URL,
  granularity: PeriodGranularity,
  provider: string,
): Promise<AdapterResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/vnd.sdmx.data+json,application/json' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'transport', message: err instanceof Error ? err.message : String(err) },
    };
  }

  if (!res.ok) {
    const kind = res.status === 429 ? 'rate_limit' : res.status === 404 ? 'not_found' : 'transport';
    return {
      ok: false,
      error: { kind, message: `${provider} HTTP ${res.status} for ${url.pathname}`, status: res.status },
    };
  }

  const text = await res.text();

  // A 200 with an empty body is how SDMX says "no data for this key" — a no-op
  // rather than a failure, same as an empty observations array.
  if (text.trim().length === 0) return { ok: true, observations: [] };

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: { kind: 'parse', message: `${provider}: non-JSON response: ${text.slice(0, BODY_SNIPPET)}` },
    };
  }

  return parseSdmxResponse(payload, granularity, provider);
}
