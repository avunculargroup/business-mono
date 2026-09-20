/**
 * ABS adapter — the Australian Bureau of Statistics Data API (SDMX).
 *
 * GET https://data.api.abs.gov.au/rest/data/{dataflow}/{dataKey}
 *   ?startPeriod=…&format=jsondata
 *
 * Both parts come from `provider_table_ref`, which this reads as
 * `"{dataflow}/{dataKey}"` — see `parseDataflowRef`. The parsing itself is
 * shared with the OECD adapter in `sdmx.ts`, because the clunky part is the
 * encoding rather than the publisher.
 *
 * **The seeded AU CPI ref is a dataflow with no data key.** `'CPI'` asks for
 * every series in the dataflow — All Groups alongside every component, capital
 * city and adjustment — and the parser refuses a multi-series answer rather than
 * picking one. That refusal is the point: which CPI series the indicator means
 * is a decision for whoever activates it, and its message names the series that
 * came back so the key can be written from the answer. The seed note says the
 * same thing ("CONFIRM against the live ABS SDMX endpoint").
 *
 * Not verified against a live response — no network egress where this was
 * written. See the header of `sdmx.ts`.
 *
 * See docs/features/economic-indicators/adapter-contract.md.
 */

import type {
  AdapterResult,
  FetchOptions,
  IndicatorConfig,
  ProviderAdapter,
} from '../types.js';
import { fetchSdmx, parseDataflowRef } from './sdmx.js';
import { startPeriodFor } from './sdmxWindow.js';

const ABS_ENDPOINT = 'https://data.api.abs.gov.au/rest/data';

export const absAdapter: ProviderAdapter = {
  provider: 'abs',

  async fetchLatest(indicator: IndicatorConfig, opts?: FetchOptions): Promise<AdapterResult> {
    if (!indicator.providerTableRef) {
      return {
        ok: false,
        error: {
          kind: 'not_found',
          message: `Indicator ${indicator.shortLabel} has no providerTableRef (ABS dataflow)`,
        },
      };
    }

    const { dataflow, dataKey } = parseDataflowRef(indicator.providerTableRef);
    const granularity = indicator.granularity ?? 'monthly';

    // `all` is the SDMX wildcard for "every series in the dataflow". It is sent
    // rather than omitted so the URL stays well-formed; the parser is what
    // refuses the several series it comes back with.
    const url = new URL(`${ABS_ENDPOINT}/${dataflow}/${dataKey ?? 'all'}`);
    url.searchParams.set('format', 'jsondata');
    url.searchParams.set('startPeriod', startPeriodFor(granularity, opts?.limit));

    return fetchSdmx(url, granularity, 'ABS');
  },
};
