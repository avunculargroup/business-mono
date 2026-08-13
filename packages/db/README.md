# @platform/db

The Supabase client, the generated database types, and typed wrappers around the RPC
functions. Imported by both apps.

**Last updated:** 2026-08-11

## What's in it

| Path | Contents |
|---|---|
| `src/client.ts` | `supabase` client and `createRealtimeClient` |
| `src/types/database.ts` | **Generated** — do not hand-edit; regenerate instead |
| `src/rpc/` | Typed wrappers over the Postgres RPC functions |
| `src/seeds/brand-voice.ts` | Parses `docs/brand-voice.md` into `brand_assets` rows |

## RPC wrappers

Use these rather than writing raw `.rpc()` calls — they carry the result types.

| Export | Backing search |
|---|---|
| `vectorSearch` | pgvector similarity over `knowledge_items` (HNSW) |
| `graphTraverse` | Recursive CTE over `knowledge_connections` |
| `fulltextSearch` | Postgres FTS over `knowledge_items.raw_content` |
| `contentVectorSearch` | `content_embeddings` — the newsletter workflow's RAG store |
| `newsVectorSearch` | Ingested `news_items` |
| `transcriptVectorSearch` | Podcast transcript segments |
| `segmentSearch` | Extracted report text (PDF/HTML report ingestion) |

## Migrations

`supabase/migrations/` **at the repo root** is the execution source of truth, applied
automatically when a migration file merges to `main`. `schema.sql` at the root is a
human-readable consolidated reference and must not be run against a live database.

The full workflow is in [`./MIGRATIONS.md`](./MIGRATIONS.md).

```bash
pnpm db:migrate          # supabase db push
pnpm db:diff             # diff local against migration history
pnpm db:pull             # pull remote schema into a new migration
pnpm db:reset            # reset local and replay all migrations
```

> `packages/db/migrations/` (one file, `001_add_source_to_contacts.sql`) predates the
> Supabase CLI workflow and is not applied by anything. Left in place as history.

## Regenerating types

After any schema change:

```bash
pnpm db:generate-types   # writes src/types/database.ts
```

Requires `SUPABASE_PROJECT_ID`. Against a local stack, use
`supabase gen types typescript --local > packages/db/src/types/database.ts` instead.

## Seeding brand assets

```bash
pnpm --filter @platform/db seed:brand-voice
```

Run whenever `docs/brand-voice.md` changes. It parses the markdown into sections and upserts
them as `brand_assets` records, soft-deleting the previous versions.

> **Known defect:** `package.json` declares `./server` and `./browser` subpath exports
> pointing at `src/server.ts` and `src/browser.ts`, neither of which exists. Nothing imports
> them today, so it is latent — but adding an import of `@platform/db/server` will fail to
> resolve until the files exist or the exports are removed.
