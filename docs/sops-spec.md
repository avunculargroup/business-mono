# Standard Operating Procedures (SOPs) — Spec

**Status:** Draft
**Owner:** Chris
**Related docs:** `docs/web-app-spec.md`, `docs/auth-spec.md`, `docs/design-brief.md`, `docs/brand-voice.md`, `schema.sql`

---

## Purpose

SOPs are the canonical source of truth for *how things are done* at BTS. They are written by humans, edited like rich text, stored as markdown, version-controlled, exportable, and — critically — designed from day one to be readable by agents via RAG retrieval.

An SOP is not a wiki page. It is a structured, repeatable procedure that a human (or eventually an agent) can follow to produce a known outcome. Examples:

- "How Rex conducts a deep-research brief"
- "How we onboard a new consulting client"
- "How Charlie drafts a LinkedIn post in the BTS voice"
- "How we run the weekly content review"

SOPs are the substrate for institutional memory. They will become the single most-queried RAG corpus once the agent platform matures.

---

## Goals

1. **Authoring feels effortless.** A WYSIWYG editor that hides markdown syntax but produces clean markdown on save.
2. **History is non-negotiable.** Every save is a revision. Diffs are viewable. Restores are one click.
3. **Agents can read SOPs.** Embeddings are generated on publish. `curator_notes` explain *why* the SOP exists, which is what makes RAG retrieval contextually intelligent.
4. **Export is frictionless.** Single .md, styled PDF, bulk zip, or copy-to-clipboard — all one click.
5. **Draft and Published are distinct.** Agents only ever read published versions. Humans edit drafts.

---

## Non-goals (for v1)

- Real-time collaborative editing (Google Docs style). Two-person team, low concurrency, optimistic locking is enough.
- Comments / inline annotations. Defer until usage justifies it.
- Approval workflow with separate reviewers. Two co-founders is informal enough — "publish" is the gate.
- Templates library. Add later if patterns emerge.
- Folder hierarchy. Tags + categories are flatter and more agent-friendly.

---

## Data model

### New tables

```sql
-- ============================================================
-- SOPs
-- Standard Operating Procedures — human-authored, agent-readable
-- ============================================================

CREATE TABLE sops (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  title           TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,            -- url-safe, derived from title on first save
  summary         TEXT,                            -- one-line description, shown in lists

  -- Classification
  category        TEXT NOT NULL DEFAULT 'general'
                  CHECK (category IN ('general', 'crm', 'content', 'research',
                                      'operations', 'client_delivery', 'agent_runbook')),
  tags            TEXT[] DEFAULT '{}',

  -- Ownership and routing
  owner_id        UUID REFERENCES team_members(id),

  -- Linked agent (optional) — if this SOP is the runbook for a specific agent
  -- e.g. 'rex', 'charlie', 'petra'. Null for human-only SOPs.
  related_agent   TEXT,

  -- Curator notes — the "why" that makes RAG retrieval intelligent.
  -- This is the differentiator: not what the SOP says, but why it exists,
  -- when to apply it, and what it replaces.
  curator_notes   TEXT,

  -- Current published state
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'published', 'archived')),

  -- The current working draft (markdown). Always editable.
  draft_content   TEXT NOT NULL DEFAULT '',

  -- The currently published markdown. Frozen until a new revision is published.
  -- This is what agents read. Null until first publish.
  published_content TEXT,

  published_at    TIMESTAMPTZ,
  published_by    UUID REFERENCES team_members(id),

  -- Embedding of published_content for RAG.
  -- Generated on publish, not on every draft save.
  -- text-embedding-3-small = 1536 dimensions.
  embedding       VECTOR(1536),

  created_by      UUID REFERENCES team_members(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER sops_updated_at
  BEFORE UPDATE ON sops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_sops_status ON sops(status);
CREATE INDEX idx_sops_category ON sops(category);
CREATE INDEX idx_sops_owner ON sops(owner_id);
CREATE INDEX idx_sops_related_agent ON sops(related_agent);
CREATE INDEX idx_sops_tags ON sops USING GIN (tags);

-- Vector similarity index for RAG retrieval
CREATE INDEX idx_sops_embedding ON sops
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);


-- ============================================================
-- SOP Revisions
-- Every save creates a revision. Full history, diffable, restorable.
-- ============================================================

CREATE TABLE sop_revisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id          UUID NOT NULL REFERENCES sops(id) ON DELETE CASCADE,

  -- Monotonically increasing per SOP. Computed on insert.
  revision_number INTEGER NOT NULL,

  -- Snapshot of content at this revision
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  summary         TEXT,
  curator_notes   TEXT,

  -- Was this revision the one that got published?
  is_published_snapshot BOOLEAN NOT NULL DEFAULT FALSE,

  -- Human-friendly change summary (optional, like a git commit message)
  change_note     TEXT,

  created_by      UUID REFERENCES team_members(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (sop_id, revision_number)
);

CREATE INDEX idx_sop_revisions_sop ON sop_revisions(sop_id, revision_number DESC);


-- RLS: same pattern as the rest of the platform
ALTER TABLE sops          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sops_all" ON sops
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "sop_revisions_all" ON sop_revisions
  FOR ALL USING (auth.role() = 'authenticated');
```

### Notes on the model

- **`draft_content` vs `published_content`.** Drafts are mutable, published is frozen. Agents read only `published_content`. This mirrors the trust-building principle: humans iterate freely, agents see only the version a human deliberately committed to.
- **`embedding` is regenerated on publish only.** Embedding every keystroke is wasteful and noisy. The published version is the canonical agent-facing artefact.
- **`curator_notes`** is intentionally separate from the body. It is the metadata that explains *when to apply this SOP* — exactly the kind of context that makes RAG retrieval feel intelligent rather than generic. This pattern is consistent with the Archivist knowledge items.
- **`related_agent`** lets us answer "give me Rex's runbook" cleanly without overloading tags.
- **`sop_revisions.revision_number`** is monotonic per SOP. Compute it in the API layer (`SELECT COALESCE(MAX(revision_number), 0) + 1`) inside a transaction.

### Schema migration

Add the above to `schema.sql` under a new section header `-- SOPs`. Log the change in `docs/schema-changes.md` per the existing convention. Requires the `vector` extension already enabled in Supabase (assumed present given pgvector usage elsewhere).

---

## Editor architecture

### Library choice: Tiptap

Use **Tiptap v2** with React. Justification:

- ProseMirror under the hood — battle-tested, schema-driven
- Full control over which nodes/marks are allowed (we want clean markdown, not arbitrary HTML)
- First-class React integration
- Active ecosystem with markdown serialization extensions
- Stylable to match the BTS design system without fighting defaults

Avoid: BlockNote (too opinionated about block model, exports messy markdown), Milkdown (markdown-native but harder to customise), Slate (too low-level for the value it would add here).

### Markdown round-tripping

Use `tiptap-markdown` (or equivalent serializer) to:

1. **Load:** parse `draft_content` markdown → ProseMirror document on mount
2. **Save:** serialize ProseMirror document → markdown → write to `draft_content`

Round-trip must be lossless for the supported feature set. Validate this in tests: load a doc, serialize it, parse it again, assert equality.

### Allowed nodes/marks (v1)

Keep the schema deliberately tight. Every feature added is a feature that can break round-tripping.

**Nodes:**
- Paragraph
- Heading (levels 1–4 only — SOPs aren't books)
- Bullet list
- Ordered list
- Task list (checkboxes — these are SOPs after all)
- Blockquote
- Code block (with language hint)
- Horizontal rule
- Table (basic — header row + body rows, no merged cells)
- Link

**Marks:**
- Bold
- Italic
- Inline code
- Strikethrough

**Explicitly excluded for v1:**
- Images (SOPs are procedural text; revisit if needed)
- Embeds (YouTube etc.)
- Custom callouts / admonitions
- Coloured text / highlights (clashes with the design language anyway)

### UI surface

A minimal floating toolbar (bubble menu on selection) plus a slash command (`/`) menu for inserting blocks. No fixed top toolbar — it competes with the content and looks SaaS-generic. Match the design brief: warm off-white background, Playfair for headings inside the editor, DM Sans for body, JetBrains Mono inside code blocks.

### Autosave

Debounced autosave to `draft_content` every 2 seconds of inactivity, plus on blur. Show a subtle "Saved" indicator in the corner using `text-tertiary`. **Autosave does not create a new revision** — it only updates `draft_content`. Revisions are created on explicit "Save revision" or on "Publish".

### Concurrency

Optimistic locking via `updated_at`. If the server's `updated_at` is newer than what the client loaded, return 409 Conflict and surface a gentle "this SOP was edited elsewhere — reload?" modal. Two-person team, this will rarely fire.

---

## API routes (Next.js App Router)

All routes live under `apps/web/app/api/sops/`. All require authenticated session (use `getUser()`, not `getSession()`, per `docs/auth-spec.md`).

| Route | Method | Purpose |
|---|---|---|
| `/api/sops` | GET | List SOPs (filterable by status, category, tag, agent) |
| `/api/sops` | POST | Create new SOP (draft) |
| `/api/sops/[id]` | GET | Fetch single SOP (current draft + metadata) |
| `/api/sops/[id]` | PATCH | Update draft (autosave target) |
| `/api/sops/[id]` | DELETE | Soft-archive (status → 'archived') |
| `/api/sops/[id]/revisions` | GET | List revisions for an SOP |
| `/api/sops/[id]/revisions` | POST | Create an explicit revision snapshot from current draft |
| `/api/sops/[id]/revisions/[rev]` | GET | Fetch a specific revision (for diff view or restore) |
| `/api/sops/[id]/revisions/[rev]/restore` | POST | Restore a revision into the draft (does not auto-publish) |
| `/api/sops/[id]/publish` | POST | Snapshot draft → published_content, generate embedding, create revision marked `is_published_snapshot=true` |
| `/api/sops/[id]/export` | GET | Export single SOP. Query param `?format=md\|pdf` |
| `/api/sops/export/bulk` | GET | Stream a zip of all published SOPs as `.md` files |

### Publish flow (the important one)

`POST /api/sops/[id]/publish` does this in a single transaction where possible:

1. Read current `draft_content`, `title`, `summary`, `curator_notes`
2. Insert a new row into `sop_revisions` with `is_published_snapshot = true` and an incremented `revision_number`
3. Update `sops` row: `published_content = draft_content`, `published_at = NOW()`, `published_by = user`, `status = 'published'`
4. Generate embedding via OpenAI `text-embedding-3-small` over `published_content` (concatenate `title` + `summary` + `curator_notes` + `published_content` for richer retrieval signal)
5. Write embedding to `sops.embedding`
6. Log to `agent_activity` with `agent_name = 'human'`, `action = 'published_sop'`, `status = 'auto'` (this is a deliberate human action, not an agent proposal)

Embedding generation should not block the transaction commit — generate it after the row update succeeds, and tolerate transient failures with a retry (or a background job if this becomes flaky).

---

## Pages and UI

All pages live under `apps/web/app/(authenticated)/sops/`.

### `/sops` — Library index

- Header: "Standard Operating Procedures" in Playfair, primary CTA "New SOP" in gold
- Filters along the top: category dropdown, tag chips, status toggle (Draft / Published / All), search
- List of SOPs as cards (per the design brief: white surface, warm border, subtle shadow). Each card shows title, summary, category badge, last-updated relative time, status pill
- Empty state: helpful, not cute. "No SOPs yet. Start with one for the procedure you explain most often."

### `/sops/new` — Create

- Single field for title, then drops the user straight into the editor. Slug auto-generates from title on first save.

### `/sops/[slug]` — View (published)

- Read-only rendered markdown using the same Tiptap config in non-editable mode (so the rendering is identical to the editor). This avoids the classic "looks different in edit mode vs preview" trap.
- Sidebar: metadata (owner, category, tags, related agent, curator notes), revision history link, export menu (the four formats from the requirements)
- "Edit draft" button top-right opens `/sops/[slug]/edit`
- If `status = 'draft'` and no `published_content` exists yet, show a notice: "This SOP has not been published. Agents cannot read it yet."

### `/sops/[slug]/edit` — Editor

- Full-bleed editor surface. Minimal chrome.
- Top bar: title (inline editable), status, "Saved" indicator, "Publish" button (gold, primary)
- Right-side collapsible metadata panel: category, tags, owner, related agent, curator notes, summary
- Bubble menu on selection. Slash menu for blocks.
- Bottom bar: "View revisions" link

### `/sops/[slug]/revisions` — History

- List of all revisions, newest first. Each row: revision number, change note (if any), author, timestamp, "is published" badge
- Click a revision → diff view: current draft vs that revision (or revision N vs revision N-1 — toggle)
- Restore button on each revision

### `/sops/[slug]/revisions/[rev]/diff` — Diff view

- Side-by-side or unified diff using a markdown-aware diff library (e.g. `diff` + custom renderer, or `react-diff-viewer-continued` styled to fit the design system)
- "Restore this revision" CTA at the top

---

## Export pipeline

### Single .md
Trivial. Serve `published_content` (or `draft_content` if no published version) with `Content-Disposition: attachment; filename="<slug>.md"` and a small frontmatter block:

```markdown
---
title: <title>
slug: <slug>
category: <category>
tags: [<tags>]
status: <status>
published_at: <iso>
revision: <number>
---

<content>
```

### Copy to clipboard
Same content as the .md export, written to clipboard via `navigator.clipboard.writeText()`. Toast confirmation: "Copied to clipboard."

### Styled PDF
Use the `pdf` skill's recommended approach (HTML → PDF via headless Chromium or equivalent). Render the SOP through a print-stylesheet variant of the view page that uses the design tokens from `docs/design-brief.md`:

- Playfair Display title, DM Sans body
- Warm off-white background, near-black text
- Gold accent on heading rules
- Header on every page: "BTS — Standard Operating Procedure"
- Footer: SOP slug, revision number, page X of Y, generation date
- Curator notes in a tinted box on page 1

The PDF export is the artefact you'd be comfortable sending to the non-technical co-founder or attaching to a client deliverable. Worth doing properly.

### Bulk zip
Stream a zip of all *published* SOPs, organised by category:

```
sops-export-2026-04-13.zip
├── crm/
│   ├── client-onboarding.md
│   └── pipeline-review.md
├── content/
│   └── linkedin-post-checklist.md
├── research/
│   └── deep-research-brief.md
└── README.md   <-- index of all SOPs with summaries
```

Use `archiver` (Node) or equivalent. Stream to the response, do not buffer in memory.

---

## Agent integration (forward-looking, not v1 work)

This section exists so the data model is shaped correctly now and Claude Code knows where this is heading later.

### How agents will read SOPs

A future Mastra tool — probably called `sop_lookup` and exposed to most specialist agents — will:

1. Take a natural-language query (e.g. "how do we draft a LinkedIn post")
2. Embed the query with the same model (`text-embedding-3-small`)
3. Run a cosine similarity search against `sops.embedding` where `status = 'published'`
4. Optionally filter by `related_agent` or `category`
5. Return the top 1–3 matches with title, summary, curator_notes, and full published_content

Before building this tool, **verify the current Mastra tool API against embedded docs** (`node_modules/@mastra/core/dist/docs/`) per the Mastra skill — do not write it from memory.

### Why curator_notes matter for RAG

Embedding the body alone gives you keyword-ish retrieval. Embedding `title + summary + curator_notes + body` gives you intent-aware retrieval, because curator notes capture the *why* that the body itself usually omits. This is the same principle as Archivist knowledge items.

### Provenance

When an agent eventually consults an SOP, log it to `agent_activity` with `trigger_ref = sop_id` so we can track which SOPs are actually being used and which are dead weight. This will become an Inspector input later.

---

## Implementation order

A phased delivery, matching the project's preference for shipping foundational pieces first:

1. **Schema + RLS** — write the SQL, apply to Supabase, update `schema.sql` and `docs/schema-changes.md`
2. **API routes** — CRUD + revisions, no publish flow yet
3. **Library page + view page** — read-only, ship something visible early
4. **Editor with autosave** — Tiptap config, markdown round-tripping, draft saves
5. **Publish flow + embedding generation** — close the loop
6. **Revision history + diff view**
7. **Exports** — single .md and clipboard first, PDF and bulk zip second
8. **Polish** — empty states, error states, loading skeletons in `surface-subtle`

Each phase should be PR-sized and independently shippable.

---

## Open questions

- Should drafts be embedded as well, behind a `draft_embedding` column, so agents can optionally peek at WIP procedures? My instinct: no, it muddies the trust model. Agents read only published.
- Do we want a "deprecated" status separate from "archived" so old SOPs can stay readable but be flagged as superseded? Probably yes in v2, not v1.
- Should `sop_revisions` store a hash of `content` so we can short-circuit no-op saves? Cheap to add, useful at scale, defer for now.

---

## Routing entries to add to `CLAUDE.md`

Add to the routing table:

| When working on... | Read this first | Why |
|---|---|---|
| SOPs editor, library, exports | `docs/sops-spec.md` | Editor schema constraints, publish flow, export formats |
| Adding an SOP RAG tool to an agent | `docs/sops-spec.md` (Agent integration section) + Mastra embedded docs | Embedding model and retrieval contract; verify Mastra tool API against installed version |
