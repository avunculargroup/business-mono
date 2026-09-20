/**
 * OECD adapter — the OECD Data Explorer's SDMX API.
 *
 * GET https://sdmx.oecd.org/public/rest/data/{agency},{dataflow},{version}/{dataKey}
 *   ?startPeriod=…&format=jsondata
 *
 * Same SDMX parsing as ABS (`sdmx.ts`); only the URL differs, and it differs in
 * one way that matters: OECD addresses a dataflow by a three-part reference —
 * agency, dataflow, version — where ABS takes the dataflow id alone.
 *
 * **The seeded AU Business Confidence ref is missing its agency.**
 * `'DSD_STES@DF_CLI / AUS.M.BCICP...AA'` gives the dataflow and a data key that
 * does pin one series, but `DSD_STES@DF_CLI` alone is not addressable: the
 * request needs `OECD.SDD.STES,DSD_STES@DF_CLI,` or whichever agency and version
 * actually own it. Rather than invent one — a wrong agency is a 404 that looks
 * like a missing series — this refuses with a message naming the ref it was
 * given and the form it needs. Writing the agency in is part of activating that
 * row.
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

const OECD_ENDPOINT = 'https://sdmx.oecd.org/public/rest/data';

/**
 * An OECD dataflow reference is `agency,dataflow,version` — commas included,
 * version optionally blank (`OECD.SDD.STES,DSD_STES@DF_CLI,`). A ref with no
 * comma names a dataflow without saying who publishes it, which is not a
 * request that can be made.
 */
export function isAddressableDataflow(dataflow: string): boolean {
  return dataflow.includes(',');
}

export const oecdAdapter: ProviderAdapter = {
  provider: 'oecd',

  async fetchLatest(indicator: IndicatorConfig, opts?: FetchOptions): Promise<AdapterResult> {
    if (!indicator.providerTableRef) {
      return {
        ok: false,
        error: {
          kind: 'not_found',
          message: `Indicator ${indicator.shortLabel} has no providerTableRef (OECD dataflow)`,
        },
      };
    }

    const { dataflow, dataKey } = parseDataflowRef(indicator.providerTableRef);

    if (!isAddressableDataflow(dataflow)) {
      return {
        ok: false,
        error: {
          kind: 'not_found',
          message:
            `Indicator ${indicator.shortLabel} has OECD dataflow "${dataflow}", which names no `
            + 'agency. The ref must be "{agency},{dataflow},{version}/{dataKey}" — e.g. '
            + '"OECD.SDD.STES,DSD_STES@DF_CLI,/AUS.M.BCICP...AA".',
        },
      };
    }

    const granularity = indicator.granularity ?? 'monthly';
    const url = new URL(`${OECD_ENDPOINT}/${dataflow}/${dataKey ?? 'all'}`);
    url.searchParams.set('format', 'jsondata');
    url.searchParams.set('startPeriod', startPeriodFor(granularity, opts?.limit));

    return fetchSdmx(url, granularity, 'OECD');
  },
};
