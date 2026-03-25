'use server';

import type { Json } from '@platform/db';
import { createClient } from '@/lib/supabase/server';

const WEB_THREAD_ID = 'web';

export async function sendDirective(message: string): Promise<{ success: boolean; error?: string }> {
  const trimmed = message.trim();
  if (!trimmed) return { success: false, error: 'Empty message' };

  const supabase = await createClient();

  // Get or create the web conversation thread
  const { data: conv } = await supabase
    .from('agent_conversations')
    .select('id, messages')
    .eq('signal_chat_id', WEB_THREAD_ID)
    .maybeSingle();

  const directorMessage = {
    role: 'user',
    content: trimmed,
    timestamp: new Date().toISOString(),
    source: 'web',
  };

  if (conv?.id) {
    const messages = [...((conv.messages as Json[]) ?? []), directorMessage as Json];
    const { error } = await supabase
      .from('agent_conversations')
      .update({ messages })
      .eq('id', conv.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabase
      .from('agent_conversations')
      .insert({
        signal_chat_id: WEB_THREAD_ID,
        thread_type: 'direct',
        messages: [directorMessage],
      });
    if (error) return { success: false, error: error.message };
  }

  // The agents server listens to agent_conversations via Supabase Realtime
  // and will trigger Simon automatically — nothing more needed here.
  return { success: true };
}
