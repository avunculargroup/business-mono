'use server';

import { createClient } from '@/lib/supabase/server';

const WEB_CHAT_ID = 'web';

export async function sendDirective(message: string): Promise<{ success: boolean; error?: string }> {
  const trimmed = message.trim();
  if (!trimmed) return { success: false, error: 'Empty message' };

  const supabase = await createClient();

  // Get or create the web conversation thread
  const { data: conv } = await supabase
    .from('agent_conversations')
    .select('id, messages')
    .eq('signal_chat_id', WEB_CHAT_ID)
    .maybeSingle();

  const directorMessage = {
    role: 'user',
    content: trimmed,
    timestamp: new Date().toISOString(),
    source: 'web',
  };

  if (conv?.id) {
    const messages = [...((conv.messages as unknown[]) ?? []), directorMessage];
    const { error } = await supabase
      .from('agent_conversations')
      .update({ messages, last_message_at: new Date().toISOString() })
      .eq('id', conv.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabase
      .from('agent_conversations')
      .insert({
        signal_chat_id: WEB_CHAT_ID,
        thread_type: 'direct',
        participant_ids: [],
        messages: [directorMessage],
        last_message_at: new Date().toISOString(),
      } as never);
    if (error) return { success: false, error: error.message };
  }

  // Trigger Simon agent — fire and forget so the UI doesn't wait
  const agentsUrl = process.env['AGENTS_URL'] ?? 'http://localhost:3000';
  const agentsApiKey = process.env['AGENTS_API_KEY'] ?? '';

  fetch(`${agentsUrl}/api/simon/directive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': agentsApiKey,
    },
    body: JSON.stringify({ message: trimmed }),
  }).catch((err: unknown) => {
    console.error('[sendDirective] Failed to trigger Simon agent:', err);
  });

  return { success: true };
}
