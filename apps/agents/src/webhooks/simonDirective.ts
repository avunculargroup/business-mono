import { simon } from '../agents/simon/index.js';
import { supabase } from '@platform/db';

const WEB_CHAT_ID = 'web';

type ConvMessage = {
  role: string;
  content: string;
  timestamp?: string;
  source?: string;
};

export async function handleSimonDirective(req: Request): Promise<Response> {
  // Validate API key
  const apiKey = req.headers.get('x-api-key');
  const expectedKey = process.env['AGENTS_API_KEY'];
  if (expectedKey && apiKey !== expectedKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let message: string;
  try {
    const body = await req.json() as { message?: string };
    message = body.message?.trim() ?? '';
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!message) {
    return new Response(JSON.stringify({ error: 'Missing message' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Fetch current conversation (the director's message was already saved by the web action)
    const { data: conv } = await supabase
      .from('agent_conversations')
      .select('id, messages')
      .eq('signal_chat_id', WEB_CHAT_ID)
      .single();

    const existingMessages: ConvMessage[] = Array.isArray(conv?.messages)
      ? (conv.messages as ConvMessage[])
      : [];

    // Build messages array for Simon from conversation history
    const messagesForSimon = existingMessages.map((m) => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }));

    // Run Simon agent with full conversation history
    const result = await simon.generate(messagesForSimon);

    const simonMessage: ConvMessage = {
      role: 'assistant',
      content: result.text,
      timestamp: new Date().toISOString(),
      source: 'simon',
    };

    // Log to agent_activity
    await supabase
      .from('agent_activity')
      .insert({
        agent_name: 'simon',
        action: `Web directive: ${message.slice(0, 120)}`,
        status: 'auto',
        trigger_type: 'manual',
      } as never);

    // Append Simon's response to the conversation
    if (conv?.id) {
      await supabase
        .from('agent_conversations')
        .update({
          messages: [...existingMessages, simonMessage],
          last_message_at: new Date().toISOString(),
        })
        .eq('id', conv.id);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[simon-directive] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
