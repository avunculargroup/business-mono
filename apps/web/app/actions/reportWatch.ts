'use server';

import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';
import { testDetection, type DetectionPreview } from '@/lib/news/testDetection';
import type { ReportDetectionConfig, ReportDetectionStrategy } from '@platform/shared';

/**
 * Dry-run one detection strategy against live config.
 *
 * Reads one page and reports what the daily scan would find. No acquisition, no
 * robots check, no writes — this is the preview that makes a CSS selector
 * something an operator can get right in two minutes instead of abandoning.
 *
 * Auth-gated despite being read-only: it makes an outbound request to an
 * arbitrary URL on the caller's behalf, which is not something an anonymous
 * visitor should be able to do through this app.
 */
export async function testReportDetection(
  strategy: ReportDetectionStrategy,
  config: ReportDetectionConfig,
): Promise<DetectionPreview> {
  const auth = await getAuthedClient();
  if (!auth.ok) return { ok: false, error: auth.error };

  return testDetection(strategy, config);
}

/**
 * Reset a source's silent-failure counter.
 *
 * Used from the health panel after fixing a selector: the operator knows the
 * scraper works again, and leaving the counter at 12 would keep the source at
 * the top of a table that is only ever read when something is wrong.
 */
export async function clearDetectionAlert(sourceId: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase
    .from('news_sources')
    // detection_consecutive_empty is absent from the generated types until
    // `pnpm --filter @platform/db generate-types` runs post-migration.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ detection_consecutive_empty: 0, last_error: null } as any)
    .eq('id', sourceId);

  if (error) return { error: humanizeError(error) };
  return { success: true };
}
