// Splits the flat voice_snippets list into the canon (company-wide) set and a
// given account's own set — used to render the umbrella + override snippet
// panels on both the company voice and each account voice editor.

import type { VoiceSnippetRow } from './voiceTypes';

export function canonSnippets(snippets: VoiceSnippetRow[]): VoiceSnippetRow[] {
  return snippets.filter((s) => s.social_account_id === null);
}

export function accountSnippets(snippets: VoiceSnippetRow[], accountId: string): VoiceSnippetRow[] {
  return snippets.filter((s) => s.social_account_id === accountId);
}
