import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { NewsItemDetail } from './NewsItemDetail';
import type { ReportPanelRecord } from './ReportPanel';
import type { NewsItemRecord } from '@platform/shared';

// The columns ReportPanel renders. Listed explicitly rather than `select('*')`
// because `reports.body` is the full extracted markdown of a 200-page document
// and the feed item already carries it.
const REPORT_COLUMNS =
  'id, report_type, publisher, published_at, published_at_source, page_count, word_count, ' +
  'file_format, file_size_bytes, content_hash, extraction_method, extraction_quality, ocr_used, ' +
  'redistribution, licence_notes, curator_note, status, storage_path, revision_of_report_id, created_at';

export const dynamic = 'force-dynamic';

// Note: /news already has static children (daily, podcasts, sources). Next
// resolves those ahead of this dynamic segment, so there is no conflict today —
// but a future static child under /news would silently shadow this route.
export default async function NewsItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase.from('news_items').select('*').eq('id', id).single();
  if (!item) notFound();

  const news = item as unknown as NewsItemRecord;

  const sourceName = news.source_id
    ? await supabase
        .from('news_sources')
        .select('name')
        .eq('id', news.source_id)
        .single()
        .then((r) => (r.data as { name: string } | null)?.name ?? news.source_name)
    : news.source_name;

  // report_id is NULL for every other item type, so this costs one extra query
  // only for reports.
  const reportId = (news as unknown as { report_id: string | null }).report_id;
  let report: ReportPanelRecord | null = null;
  let supersededItemId: string | null = null;

  if (reportId) {
    // `reports` is absent from the generated Database types until
    // `pnpm --filter @platform/db generate-types` runs against the migrated
    // database. Cast at the boundary; the row shape is asserted explicitly.
    const { data } = await supabase
      .from('reports' as never)
      .select(REPORT_COLUMNS)
      .eq('id', reportId)
      .single();
    report = (data ?? null) as unknown as ReportPanelRecord | null;

    // A revision links back to its predecessor. Resolve the predecessor's feed
    // item so the notice can link to something a reader can actually open.
    if (report?.revision_of_report_id) {
      const { data: prior } = await supabase
        .from('reports' as never)
        .select('news_item_id')
        .eq('id', report.revision_of_report_id)
        .single();
      supersededItemId = (prior as { news_item_id: string | null } | null)?.news_item_id ?? null;
    }
  }

  return (
    <>
      <PageHeader title={report ? 'Report' : 'Article'} backHref="/news" backLabel="News feed" />
      <NewsItemDetail
        item={news}
        sourceName={sourceName}
        report={report}
        supersededItemId={supersededItemId}
      />
    </>
  );
}
