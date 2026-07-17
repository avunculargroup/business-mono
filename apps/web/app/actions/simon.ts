'use server';

import type { Json } from '@platform/db';
import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';

const WEB_THREAD_ID = 'web';

export async function sendDirective(message: string): Promise<{ success: boolean; error?: string }> {
  const trimmed = message.trim();
  if (!trimmed) return { success: false, error: 'Empty message' };

  const auth = await getAuthedClient();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

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
    if (error) return { success: false, error: humanizeError(error) };
  } else {
    const { error } = await supabase
      .from('agent_conversations')
      .insert({
        signal_chat_id: WEB_THREAD_ID,
        thread_type: 'direct',
        messages: [directorMessage],
      });
    if (error) return { success: false, error: humanizeError(error) };
  }

  // The agents server listens to agent_conversations via Supabase Realtime
  // and will trigger Simon automatically — nothing more needed here.
  return { success: true };
}
