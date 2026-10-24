# Build progress — Newsletter Content Extraction & Link Following

Spec: [news-source-email-extraction-spec.md](./news-source-email-extraction-spec.md). This file
records what was built, where it differs from the spec and why, and what is still to run. Read it
before the spec when you pick this work up.

## Status

| Session | State |
| --- | --- |
| 0 — Diagnose the 22–23 Oct failures | Diagnosed; the fix is an environment change, not code (see below) |
| 1 — Shared URL layer | Built |
| 2 — Link following | Built; the migration applies on merge to `main` |
| 3 — Email body extraction | Built, against synthetic fixtures |
| 4 — Renderer | Built |
| 5 — Backfill | Script built and tested; **not run** |
| 6 — Docs | Done |

## Session 0 — the failures are platform-wide

The spec read this as a link-path problem. It is not. Every LLM-scored news item from every path
failed from 22 Oct 01:59 UTC: RSS (151 rows), email parents (26), followed links (26) and
report watch (1). Every one has `rex_metadata.scoring_failed = true`, and the RSS and
followed-link rows are also `extraction_failed`. The last scored row was 21 Oct 22:39 UTC. No
code reached `main` in that window, only docs. The two failing calls use different models: the
extractor scope is overridden to `deepseek/deepseek-v3.2` in `model_configs`, and the rubric
falls back to the default Anthropic model. A failure that hits both points at the provider
credentials: the OpenRouter key's credit limit, or `ANTHROPIC_API_KEY`, which
`config/model.ts` falls back to on a key-limit 403. The same thing happened on 12 Oct, when 9
followed links failed.

Check the Railway logs for `component: "news-ingest"` / `"model"` from 22 Oct, top up or rotate
the key, and confirm the next row stores a score. The backfill's `--rescore` can then re-score
those rows. They are email items, so they fall in its scope. The RSS rows would need their own
pass.

## Where the build differs from the spec

- **`emptyContainers` (Stage 1, rule 7) is not built.** The spec's own coverage check found it
  dead. With the rule switched off, no fixture's output changed: Turndown's blank-element rule
  already drops empty containers, and `normaliseMarkdown` strips what is left.
  `CLEAN_RULES` in `emailClean.ts` lists six rules.
- **The footer walk climbs to the outermost block that is under 600 characters *and* under 25% of
  the text.** The spec says "smallest block ancestor under 600 characters", which is ambiguous.
  "Outermost under 600" alone climbs to the whole issue when the email is short, and then the
  25% guard throws the cut away.
- **Opaque wrappers in link following are resolved lazily, in document order, until the cap is
  met.** The spec resolves every candidate that survives the anchor-text filter. On a HubSpot
  issue with sixty links, that is sixty requests, and each one registers as a click with the
  sender. The cap still applies after filtering, so chrome no longer uses up the budget.
- **`ingestion_ref` also carried the wrapper, tokens included.** Followed links stored
  `{parentRef}#link:{wrapperUrl}`. New rows key on the real URL, and the backfill rewrites the old
  ones. The spec's acceptance queries look only at `url` and `canonical_url`, so they would not
  have caught this.
- **`extractCanonicalUrl` never decoded `&amp;`.** Every canonical URL with more than one
  parameter was corrupted (`?a=1&amp;b=2`). Fixed, because the canonical URL now goes through
  the parameter strip.
- **The self-domain rule ignores shared sending platforms, and an allow pattern overrides it.**
  Pompliano sends from `substack.com`, so a literal sender-domain rule would deny every Substack
  link, other writers' posts included. Seeking Alpha sends from `seekingalpha.com`, so the spec's
  own proposal, allowing `seekingalpha.com/article/`, could never match. A publication's own
  subdomain on a platform (`tftc.ghost.io`) still counts as self.
- **The snapshot table is created by the migration**, not by the script, because supabase-js
  cannot run DDL. It has the same team-only policy the spec asks for. Drop it in a follow-up
  migration once the acceptance queries pass.
- **The backfill script is `apps/agents/src/scripts/backfillNewsletterContent.ts`**, next to
  `rechunkTranscripts.ts`, rather than `apps/agents/scripts/`, so it is typechecked.
- **The anchor deny list grew**: `Like`, `Comment`, `Restack`, `Read in app`, `Get the app`,
  `Start writing`, `More like this` and `Less like this`, from the Substack and Ghost templates.
  It is shared by the body cleaner and link following.
- **Substack profile, app-link, refer and subscribe paths are denied** (`substack.com/@…`,
  `/app-link/…`), and so is any parameter value that is a JWT, whatever its name.

## Open questions — what the build assumed

| Question | Assumed | Where |
| --- | --- | --- |
| Seeking Alpha link following | Off, per the proposal | The migration sets `follow_links = false` for slug `seekingalpha`. Turn it back on, or add `seekingalpha.com/article/` as an allow pattern, from `/news/sources` |
| Opaque links inside email bodies | Text only, per the proposal | `emailClean.ts`, rule `links` |
| Unresolvable followed-link rows | Deletion candidates, but only for rows a person marks `approve=yes` | The backfill report, action `delete_unresolvable` |
| `JINA_API_KEY` | Optional. Sent when set; nothing needs it | `agents/researcher/tools.ts` |
| CRM email path | Not folded in | `fastmailJmap.extractBody` / `stripHtml` are unchanged |
| Raw HTML retention | Indefinite | No pruning job |

## Real-data check of the link path

The new offline logic was run over the 1,248 stored followed-link URLs, without writing
anything:

- 1,031 decode offline (Seeking Alpha click paths).
- 199 need one redirect request: 135 Ghost, 43 Substack, 17 Hashrate Ghost, and 4 Seeking Alpha
  `/external/` links.
- 18 were never wrapped.
- 276 are denied on their real URL. 264 are Seeking Alpha `/account/email-auth` login links,
  whose `sailthru_auth_param` is a login token. The rest are Substack app-links and profiles.
- 773 survive, and dedup leaves 739.

## Fixtures

`apps/agents/test/fixtures/newsletters/` holds **synthetic** emails, one per template family.
The raw HTML was never kept, which is what `news_item_raw` now fixes, so each fixture was built
by hand from the platform's template structure and the wrapper shapes seen in `news_items`.
Every token is a placeholder. Once a week of `news_item_raw` rows exists, check each family's
fixture against the real structure and rebuild any that drifted. Don't paste from the table;
the repository is public. `emailClean.fixtures.test.ts` switches off each rule in turn and
requires a fixture to change.

## Running the backfill

The migration must be applied first, so this runs after merge.

```bash
# 1. Dry run — writes the report, touches nothing
pnpm --filter @platform/agents backfill:newsletter --out /tmp/newsletter-backfill.csv

# 2. Review the CSV. Set approve=yes on every merge / delete_* row you accept.
#    update_* rows run if they are in the file; delete the line to skip one.

# 3. Write pass, re-scoring where more than 20% of the scored window changed
pnpm --filter @platform/agents backfill:newsletter --apply /tmp/newsletter-backfill.csv --rescore
```

The report carries a host for each old wrapper and never the full URL, so it holds no token. The
write pass re-plans and runs only the rows that match the report's action and target. A row
whose target changed since the review is skipped. Opaque wrappers resolve at one request a
second, so about 200 followed rows add roughly four minutes. `--skip-raw` skips the
research-folder walk, and `--limit N` plans the first N rows only.

Then re-run the acceptance queries in the spec and drop `news_items_backfill_snapshot`.

## Verification still to do after merge

- One day of mail: the wrapper, token and duplicate queries return 0 for new rows.
- Acceptance queries on fresh email ingests: under 10% of characters inside link parentheses,
  no invisible characters, no empty links.
- `/news/[id]` on a real item at 375px and 320px. The renderer was checked in a harness that
  uses the real tokens and the detail page's 760px container: no page-level horizontal scroll
  at either width, and a wide table scrolls inside its own box. The authenticated page itself
  was not opened.
- `audit_permissive_policies()` returns zero rows. Regenerate types with
  `pnpm --filter @platform/db generate-types`; until then the new table is reached through the
  usual cast.
