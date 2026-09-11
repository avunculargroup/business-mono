import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PackEditor } from './PackEditor';
import { requireClientRepositories, readContext } from '@/lib/repositories';
import page from '@/components/Page.module.css';

export const metadata: Metadata = { title: 'Prepare' };

/**
 * One pack.
 *
 * The server resolves the template and the facts — both of which are BTS's —
 * and hands them to a client component, which owns everything the subscriber
 * writes. The boundary between the two halves of the page is the boundary
 * between the two layers of the model, and it is not a coincidence: facts
 * refresh, prose persists, and the prose has to live where the server cannot
 * see it for that to be structurally true rather than a policy.
 */
export default async function PackPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pack?: string }>;
}) {
  const [{ slug }, { pack }] = await Promise.all([params, searchParams]);

  const repositories = await requireClientRepositories();
  const ctx = readContext();

  const template = await repositories.prepare.template(ctx, slug);
  if (!template) notFound();

  const [resolved, identity, warning] = await Promise.all([
    repositories.prepare.resolveFacts(ctx, template.factsRequired),
    repositories.compliance.identity(ctx),
    repositories.compliance.activeDocument(ctx, 'general_advice_warning'),
  ]);

  return (
    <>
      <Link href="/prepare" className={page.lede}>
        ← Prepare
      </Link>

      <header className={page.header}>
        <h1 className={page.title}>{template.title}</h1>
        <p className={page.lede}>
          {template.sections.length} lines of enquiry. Each one is a question a board, a
          co-trustee or an auditor will ask, with the reason it gets asked and the current
          state of any relevant fact. What you write stays on this device.
        </p>
      </header>

      <PackEditor
        template={template}
        facts={resolved.facts}
        absent={resolved.absent}
        factsFetchedAt={resolved.resolvedAt}
        identity={identity}
        generalAdviceWarning={
          warning?.body
          // The export must carry a warning even when the library has none
          // loaded yet. A pack circulated without one is the failure this
          // fallback exists to prevent.
          ?? 'This document contains general information only. It does not take account of '
            + 'the objectives, financial situation or needs of any person, and it is not a '
            + 'recommendation to acquire, hold or dispose of any product.'
        }
        {...(pack ? { initialPackId: pack } : {})}
      />
    </>
  );
}
