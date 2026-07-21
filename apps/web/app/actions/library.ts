'use server';

import type { LibraryQuestion } from '@platform/shared';
import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';

const MIN_QUESTION_LENGTH = 8;
const MAX_QUESTION_LENGTH = 500;

export type AskLibraryResult = { id: string } | { error: string };
export type LibraryQuestionResult = { question: LibraryQuestion } | { error: string };

// Ask a question of the podcast library. Inserts a pending row; the agents
// server's libraryQuestionListener claims it, runs the RAG pass (Rex retrieves +
// synthesises with citations, Lex reviews), and writes the answer back. The web
// app can't reach the agents server over HTTP, so it only writes intent — the
// caller polls getLibraryQuestion until the row resolves.
export async function askLibraryQuestion(question: string): Promise<AskLibraryResult> {
  const trimmed = question.trim();
  if (trimmed.length < MIN_QUESTION_LENGTH) return { error: 'Ask a fuller question.' };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { user } = auth;
  // library_questions isn't in the generated Database types until they're
  // regenerated post-migration, so access goes through a boundary cast — the same
  // pattern the agents-side podcast intelligence code uses.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = auth.supabase as unknown as { from: (t: string) => any };

  const { data, error } = await db
    .from('library_questions')
    .insert({ question: trimmed.slice(0, MAX_QUESTION_LENGTH), asked_by: user.id })
    .select('id')
    .single();

  if (error) return { error: humanizeError(error) };
  return { id: (data as { id: string }).id };
}

// Read one question row (for polling while the answer is generated).
export async function getLibraryQuestion(id: string): Promise<LibraryQuestionResult> {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = auth.supabase as unknown as { from: (t: string) => any };

  const { data, error } = await db
    .from('library_questions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return { error: humanizeError(error) };
  return { question: data as unknown as LibraryQuestion };
}
