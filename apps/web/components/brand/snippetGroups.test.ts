import { describe, it, expect } from 'vitest';
import { canonSnippets, accountSnippets } from './snippetGroups';
import type { VoiceSnippetRow } from './voiceTypes';

function snippet(overrides: Partial<VoiceSnippetRow>): VoiceSnippetRow {
  return {
    id: 'id',
    snippet_type: 'opener',
    body: 'body',
    curator_note: null,
    platform: null,
    topic_tags: [],
    is_starred: false,
    social_account_id: null,
    ...overrides,
  };
}

describe('canonSnippets', () => {
  it('returns only snippets with no social_account_id', () => {
    const list = [snippet({ id: 'a', social_account_id: null }), snippet({ id: 'b', social_account_id: 'acc-1' })];
    expect(canonSnippets(list).map((s) => s.id)).toEqual(['a']);
  });
});

describe('accountSnippets', () => {
  it('returns only snippets scoped to the given account', () => {
    const list = [
      snippet({ id: 'a', social_account_id: null }),
      snippet({ id: 'b', social_account_id: 'acc-1' }),
      snippet({ id: 'c', social_account_id: 'acc-2' }),
    ];
    expect(accountSnippets(list, 'acc-1').map((s) => s.id)).toEqual(['b']);
  });

  it('returns an empty list when the account has no snippets', () => {
    const list = [snippet({ id: 'a', social_account_id: null })];
    expect(accountSnippets(list, 'acc-1')).toEqual([]);
  });
});
