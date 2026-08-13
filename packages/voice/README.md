# @platform/voice

Brand-voice resolution: turns the company voice canon plus an optional per-account override
into one merged voice context, with retrieved exemplar snippets, ready to drop into a
generation prompt.

**Last updated:** 2026-08-11

## The idea

The company canon (`brand_voice.profile`) and each account override
(`social_accounts.voice_profile`) share an identical shape. That sameness is the design: one
merge function, one editor, and one validator serve both.

`resolveVoiceContext()` does the whole resolution in one call:

1. Load the active company `brand_voice` (the umbrella).
2. Load the account `voice_profile` (the override), if an account is given.
3. Merge them — the account wins on overlap, `vocabulary_avoid` is unioned.
4. Retrieve top-N exemplar snippets by similarity, platform-matched and starred-weighted.
   Account snippets take precedence; when the account has its own, the company canon serves
   only as a fallback.

Omit the account for non-account content — a newsletter or blog post — and the company canon
plus its snippets are the voice.

## Exports

| Export | Purpose |
|---|---|
| `resolveVoiceContext` | The one-call entry point above |
| `mergeVoice` | Company + account merge, used standalone by the Brand Hub editor |
| `retrieveVoiceSnippets` | Similarity retrieval over voice snippets |
| `embedVoiceText` | Embeds snippet text for that retrieval |
| `VoiceResolverDeps` | Injection seam — `deps.ts` supplies the default Supabase-backed implementation |

## Who may import this

`apps/agents` only. `apps/web` reads and writes voice data through server actions and its own
Supabase queries; it does not import this package.

The embedding store is kept in sync by `voiceEmbeddingListener` in the agent server, which
also runs a startup backfill — set `VOICE_EMBEDDING_LISTENER_ENABLED=false` locally to skip
it and avoid spending OpenAI credits on every boot.

## Testing

```bash
pnpm --filter @platform/voice test
```

`merge.ts`, `resolve.ts` and `retrieve.ts` each have a test beside them. `VoiceResolverDeps`
exists so those tests can run without a database.

## Specs

- [`../../docs/brand-voice-migration-spec.md`](../../docs/brand-voice-migration-spec.md) — the voice tables and resolver
- [`../../docs/brand-hub-voice-ux-flow.md`](../../docs/brand-hub-voice-ux-flow.md) — the Brand Hub editor UX
- [`../../docs/brand-voice.md`](../../docs/brand-voice.md) — the content source of truth this resolves against
