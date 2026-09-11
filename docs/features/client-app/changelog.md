# Changelog — Minute spec bundle

Material changes to the specification, with the reasoning. Newest first.

Amendments to the bundle should be recorded here rather than made silently. A spec whose
history is invisible gets re-litigated, and the most expensive conversations are the ones
that repeat a decision somebody already made well.

---

## 0.4.0 — 2026-09-09

### Removed: all licensing and authorisation material

**Every reference to an AFSL, an Authorised Representative appointment, a licensee, retail and
wholesale classification, and the Financial Services Guide.**

BTS has never held an AFS authorisation and has never needed one. It does not give financial
advice, and bitcoin is not a financial product. Earlier drafts of this bundle were built on a
mistaken premise that BTS operated as an AR under someone else's licence. That premise was
wrong and every consequence of it is now gone.

Deleted outright:

- `compliance/fsg-template.md` and `compliance/fsg-template-variables.json`
- `client_accounts.client_classification`, `classification_evidence`, `classification_set_by`,
  `classification_set_at`
- The `smsf_wholesale_needs_evidence` constraint
- `ClientClassification` type and `ClientSession.classification`
- The s761G retail/wholesale analysis throughout
- Session 0's "read the AR appointment deed" step
- Open question on wholesale classification evidence

### Added: the Service Statement

Replaces the FSG at the blocking gate. A plain statement of what the service is and is not —
factual information rather than financial advice, no client assets held, no facility to
consider the subscriber's circumstances, paid by the subscriber and by nobody else.

Not a regulatory document. Publishing an FSG would wrongly imply an authorisation BTS does not
hold. This is the artefact that evidences the position if anyone ever asks, which is a reason
to write it carefully rather than a reason to skip it.

`client_disclosures` is unchanged and still serves it. The gate, the versioning and the
re-block behaviour all carry over.

### Reframed: the rules got more load-bearing, not less

The structural constraints all survive, and each does more work than before. With an
authorisation, general advice is permitted and these rules keep you inside a lane you are
allowed to drive in. Without one, the rules are the position itself.

- Rule 1 renamed from "General advice only" to "No personal circumstances". Personal
  circumstances are the ingredient that turns information into advice; a service that cannot
  receive them cannot give it.
- "Compliance architecture" renamed to "Product architecture — how the not-advice line is
  held", with a note that two surfaces touch financial products regardless of bitcoin's
  status: listed securities in `/register`, and DAPs in `/directory` since April 2026. Both
  already handled structurally.
- "General advice warning" is now "information-only notice" everywhere, including export front
  matter. A general advice warning implies licensed general advice.
- Persona table lost its classification and financial-product rows. The remaining asymmetry is
  the useful one: a CFO's obligations are largely self-imposed through board policy, a
  trustee's are statutory and an auditor checks them.

### Changed: `/register` is precedent research, not securities analysis

The register exists for learning and for building your own treasury case. Rule 4 rewritten
around one line: **implementation facts, not outcome facts.**

In — accounting treatment, custody model, board or deed authority, disclosure wording and
timing, auditor questions. Out — current holding value, unrealised gain, share price since
announcement. The moment outcome facts appear the page stops being precedent and starts being
performance, which is a different question about a different asset.

`RegisterEntry` carries the rule as a doc comment so it survives contact with an implementer.

### Added: Cite in a pack

An action on every register fact row, dropping the fact and its provenance into the precedent
section of a `/prepare` pack in progress.

The register and `/prepare` are the same feature at two stages — evidence gathering and
evidence assembly — and they previously did not know about each other. This makes the
register's purpose legible from the interface rather than from a disclaimer: someone using it
is visibly building a case, not browsing holdings.

Cited facts carry the same `Fact` shape and provenance rail as bound facts. A section records
which of its facts were cited rather than bound, so the appendix can say so. Built in session
3 step 4, before `/prepare` exists, because the register reads wrong without it.

New open question: a fact cited in March and refreshed in May may have a newer date and a
changed value while the prose around it still argues the old one. The diff surfaces the
change; nothing detects the stale sentence. Probably unsolvable, stated so nobody assumes
otherwise.

### Also

- Referral rationale in `003` rewritten. The product reason now leads — independence is the
  inventory — with INFO 269 as the structural backstop rather than conflicted remuneration.
- `naming.md` restricted-terms section reframed: s923C still bars "financial adviser" and
  "financial planner", now because BTS is not one rather than because of an appointment.
- First actions cut from four to three, only one of which is code.

---

## 0.3.0 — 2026-09-09

### Added: the product is called Minute

*Minute, by Bitcoin Treasury Solutions.* Both personas already use the verb — a board minutes
a decision, a trustee minutes a resolution.

The criterion that decided it: the name has to survive being visible on a laptop screen in a
board meeting. A colleague glancing at the tab should see a governance tool.

- Product name in user-facing copy, page titles and exports. The app stays `apps/client` and
  the tables stay `client_*`; the monorepo names apps by role.
- `minute.btreasury.com.au`, alongside `hq.btreasury.com.au`.
- Four lockup variants. Standalone is Playfair 500, not 600 — at large sizes the heavier
  weight reads as a magazine masthead.
- "Line of enquiry" adopted as the term for a `::section` block. Audit vocabulary, structurally
  incapable of implying a recommendation.

### Added: `naming.md`

Destined for `.claude/skills/bts-design/references/naming.md`. Three registers of the company
name, the BTS acronym collision — it reads as a music act or "behind the scenes" externally —
lockup specs, vernacular table, and two lists of words to avoid.

---

## 0.2.0 — 2026-09-09

### Added: `/signals`, and the Lex gate goes live

The ecosystem spine already carried `client_relevant` and `compliance_class` specifically so
promotion would be a UI change rather than a migration, and described the client-promotion
gate as built and dormant, activating the day the companion app shipped. This is that day.

`neutral` and `valuation_adjacent` promote on a director's flag. `advice_adjacent` and
`solvency_adjacent` need suspend/resume approval. A `regulatory_change` classifies
`solvency_adjacent` at minimum, so the most valuable feature in the app is also the one that
can never auto-publish. Session 2 grew an approval queue in `apps/web` to work it.

### Added: `/directory`, with no paid listings

Free listing, objective published criteria, nobody can buy in or buy placement. `no_fees_mvp`
enforces it at the database level, because "we decided not to do referrals" is a sentence
someone forgets and a CHECK constraint is not.

`/directory/how-we-make-money` is a route generated from `commercial_relationships`, not a
footer. Zero-fee and reciprocal arrangements get rows too — an arrangement with no money in
it is still a conflict.

### Added: `client_note` on `ecosystem_changes`

A separate column, not a filtered view of `curator_note`. Internal notes are written for a
director and are allowed to editorialise. Promotion is an act of authorship, not a filter.

---

## 0.1.0 — 2026-09-09

Initial bundle. Eight routes, three-session build plan, four migrations, repository contracts.

### The finding that came first

All eleven RLS policies in `schema.sql` read `USING (auth.role() = 'authenticated')`, which
was correct when "authenticated" and "founder" were the same two people. A subscriber
authenticating against the same project would read the CRM, the agent activity log, the
compliance library and the contract library.

`001-rls-hardening.sql` fixes the named policies and ships an audit query, because the live
database has more tables than `schema.sql` does and the pattern was copied. Worth applying
whether or not this app ever ships.

### Decisions worth remembering

- **Not a trimmed `apps/web`.** Twenty-two route areas there, almost none client-shaped.
- **No client-facing agent.** Template review is O(templates); agent generation is
  O(documents). A v2 retrieval-only shape exists and is not this.
- **`/prepare` stores prose in IndexedDB only.** The boundary becomes a fact about where bytes
  live. Costs cross-device resume, buys facts-refresh-prose-persists.
- **`Fact.value` is a pre-formatted string, never a number.** A number invites arithmetic,
  arithmetic is derivation, derivation is a basis claim.
- **No `placeholder` key in templates.** A model answer is advice with extra steps.
- **`is_financial_product` is `NOT NULL` with no default.** An unassessed custodian must not
  slide in as `false`.
