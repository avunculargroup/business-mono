import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { SocialDraftCopyView } from '@/components/content/SocialDraftCopyView';
import styles from './copy.module.css';

// Landing page for the "Copy text" link in the social-draft email. Pure
// copy-to-clipboard surface — the email itself can't run the JS a copy button
// needs, so this real page does it instead.

export default async function ContentCopyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from('content_items')
    .select('id, title, body, type, is_thread, social_account_id, disclaimer_snippet_id')
    .eq('id', id)
    .in('type', ['linkedin', 'twitter_x'])
    .maybeSingle();

  if (!item) notFound();

  const [{ data: account }, { data: segments }, { data: disclaimer }] = await Promise.all([
    item.social_account_id
      ? supabase.from('social_accounts').select('display_name').eq('id', item.social_account_id).maybeSingle()
      : Promise.resolve({ data: null }),
    item.is_thread
      ? supabase.from('thread_segments').select('body').eq('content_item_id', id).order('sequence', { ascending: true })
      : Promise.resolve({ data: null }),
    item.disclaimer_snippet_id
      ? supabase.from('compliance_snippets').select('body').eq('id', item.disclaimer_snippet_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <>
      <PageHeader title={item.title || 'Copy draft'} />
      <Link href={`/content/${id}`} className={styles.back}>
        <ArrowLeft size={14} strokeWidth={1.5} />
        Back to draft
      </Link>
      <SocialDraftCopyView
        platform={item.type as 'linkedin' | 'twitter_x'}
        accountName={account?.display_name ?? null}
        body={item.body}
        isThread={item.is_thread}
        segments={(segments ?? []).map((s) => s.body)}
        disclaimerText={disclaimer?.body ?? null}
      />
    </>
  );
}
