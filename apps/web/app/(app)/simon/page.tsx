import { createClient } from '@/lib/supabase/server';
import { SimonThread } from '@/components/simon/SimonThread';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { toAgentActivityItem } from '@platform/data-supabase';
import type { AgentActivityItem } from '@platform/data';

export type ThreadItem =
  | { type: 'message'; data: { role: 'director' | 'simon'; content: string; source?: string; timestamp: string } }
  | { type: 'approval'; data: AgentActivityItem };

export default async function SimonPage() {
  const supabase = await createClient();

  // Fetch Simon conversations (web channel uses signal_chat_id = 'web')
  const { data: conversations } = await supabase
    .from('agent_conversations')
    .select('*')
    .eq('signal_chat_id', 'web')
    .order('updated_at', { ascending: false })
    .limit(1);

  // Fetch Simon activity (approval cards)
  const { data: activities } = await supabase
    .from('agent_activity')
    .select('*')
    .eq('agent_name', 'simon')
    .order('created_at', { ascending: false })
    .limit(50);

  // Build thread items
  const threadItems: ThreadItem[] = [];

  // Parse conversation messages
  if (conversations && conversations.length > 0) {
    const conv = conversations[0];
    const messages = conv.messages as Array<{ role: string; content: string; source?: string; timestamp?: string }>;
    if (Array.isArray(messages)) {
      for (const msg of messages) {
        threadItems.push({
          type: 'message',
          data: {
            role: msg.role === 'user' ? 'director' : 'simon',
            content: msg.content,
            source: msg.source,
            timestamp: msg.timestamp || conv.created_at,
          },
        });
      }
    }
  }

  // Add activity items (excluding web directives — already shown as director messages)
  if (activities) {
    for (const activity of activities) {
      if (/^Web directive:/i.test(activity.action)) continue;
      threadItems.push({
        type: 'approval',
        // Converted in vertical 4.11; mapped at the boundary until then.
        data: toAgentActivityItem(activity),
      });
    }
  }

  // Sort by timestamp (newest last)
  threadItems.sort((a, b) => {
    const aTime = a.type === 'message' ? a.data.timestamp : a.data.createdAt;
    const bTime = b.type === 'message' ? b.data.timestamp : b.data.createdAt;
    return new Date(aTime).getTime() - new Date(bTime).getTime();
  });

  return (
    <>
      <PageHeader title="Simon" />
      <SimonThread initialItems={threadItems} />
    </>
  );
}
