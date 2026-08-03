// detection strategy → adapter. The one place the sweep learns how a report
// can be discovered.
//
// Unlike lib/ecosystem/registry.ts, every strategy the DB admits has an adapter
// here: there are only three, and all three shipped together because
// index_page is the only one that covers publishers with no feed or sitemap at
// all — deferring it would have lost much of the feature's point.

import type { ReportDetectionStrategy } from '@platform/shared';
import type { ReportDiscoveryAdapter } from './types.js';
import { rssAdapter } from './adapters/rss.js';
import { sitemapAdapter } from './adapters/sitemap.js';
import { indexPageAdapter } from './adapters/indexPage.js';

const ADAPTERS: ReportDiscoveryAdapter[] = [rssAdapter, sitemapAdapter, indexPageAdapter];

const BY_STRATEGY = new Map(ADAPTERS.map((adapter) => [adapter.strategy, adapter]));

export function adapterFor(strategy: string): ReportDiscoveryAdapter | undefined {
  return BY_STRATEGY.get(strategy as ReportDetectionStrategy);
}

export function implementedStrategies(): ReportDetectionStrategy[] {
  return [...BY_STRATEGY.keys()];
}
