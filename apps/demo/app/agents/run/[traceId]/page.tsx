import { notFound } from 'next/navigation';
import { getTrace } from '@platform/agent-traces';
import { Page } from '@/components/Page';
import { TraceReplay } from '@/components/TraceReplay';

export default async function TraceReplayPage({
  params,
}: {
  params: Promise<{ traceId: string }>;
}) {
  const { traceId } = await params;
  const trace = getTrace(traceId);

  if (!trace) notFound();

  return (
    <Page
      title="Trace replay"
      lede="One run of the variant workflow, step by step. A director asked for a LinkedIn variant of a published post; a drafting agent wrote it from a committed payload, a compliance agent classified it, and the run then stopped and waited four hours for a person to decide."
    >
      <TraceReplay trace={trace} />
    </Page>
  );
}
