# Naming and Nomenclature

**Referenced from:** `SKILL.md`, under *Files in this skill*.
**Last updated:** 2026-09-09

Applies to every surface: `apps/web`, `apps/demo`, `apps/client`, generated documents,
social copy, and anything an agent drafts.

---

## The product

**Minute**, by Bitcoin Treasury Solutions.

Invite-only paid subscription app for Australian CFOs and SMSF trustees. Both personas
already use the verb — a board minutes a decision, a trustee minutes a resolution — so the
name is governance-native and has no hype available to it.

It passes the test that matters for this audience: a colleague glancing at that browser tab
in a board meeting sees a governance tool, not a crypto product.

**In code the app is `apps/client`.** The monorepo names apps by role, not by product. Same
for the `client_*` tables. Minute is what subscribers see; `client` is what the repository
calls it. Do not rename the directory to match the product.

**Domain:** `minute.btreasury.com.au`, alongside `hq.btreasury.com.au`.

---

## Three registers of the company name

Pick by audience and by whether the artefact is a regulatory one.

### Legal — `Bitcoin Treasury Solutions Pty Ltd`

Source: `company_profile.legal_name`, with `abn`, `licence_number` and `licence_holder`
where the context requires them.

Use in: the FSG and every compliance document, contracts and contract templates, generated
`/prepare` exports (front matter), anything lodged with or potentially read by ASIC, AFCA or
an auditor.

These documents can end up in front of a regulator. An acronym there is a small unforced
error, and the ABN is often the only thing that makes the entity identifiable.

### Trading — `Bitcoin Treasury Solutions`

Source: `company_profile.trading_name`.

Use in: the endorsement line, client-facing prose, the website, LinkedIn and all external
content, and the first mention of the company in any external document.

### Shorthand — `BTS`

Use in: the repository, feature specs, Signal messages, agent context, internal
documentation, commit messages, `notes` fields.

**Never externally on first mention, and never in the endorsement line.**

---

## Why BTS does not travel

The acronym is heavily contested outside the building. It is one of the largest music acts in
the world, and on LinkedIn specifically it colloquially reads as "behind the scenes" — which
is the platform Chris publishes on. "At BTS we think..." lands ambiguously at best.

Internally it is unambiguous because everyone in the room knows. Externally you are competing
with a fanbase.

**The always-acceptable crossover:** define it on first use, then use it freely.

> Bitcoin Treasury Solutions Pty Ltd (**BTS**) provides...

That is standard legal drafting and it is what the `compliance_documents` templates already
do. Follow it.

---

## The lockup

The second line naming the parent company is the **endorsement line**. Not a byline — a
byline is an author credit on an article, and using that word here causes confusion.

| Element | Spec |
|---|---|
| Product name | Playfair Display, weight 600, colour `#1A1915` |
| Endorsement line | DM Sans, weight 500, 12px, letter-spacing 0.04em, uppercase, colour `#6B6860` |
| Gap | 10px between the two |
| Gold rule variant | 28×2px `#C9A84C`, 14px above the product name |

### Four variants

1. **Stacked** — primary. Product name over endorsement line. Default everywhere.
2. **Horizontal** — nav bar. Product name at 34px, 1px `#E8E6E0` divider, company in DM Sans
   400 at 13px sentence case.
3. **Gold rule** — cover pages and `/prepare` exports. Stacked, with the rule above.
4. **Standalone** — favicon, app tile, browser tab. Playfair 500 at large sizes; the heavier
   600 starts to read as a magazine masthead above ~48px.

### Endorsement line rules

- Always the **trading** name. "Minute, by BTS" fails at the one job the line exists to do,
  which is attaching the product to a licensed entity a reader can look up.
- Legal name plus ABN wherever the document is a regulatory artefact — every `/prepare`
  export front matter, the disclosure gate, the FSG.
- **Variant 4 only where context already supplies the rest.** Cold and alone, "Minute" is
  briefly ambiguous in pronunciation — some readers land on my-NOOT before correcting. The
  endorsement line resolves it, so anywhere the name meets someone for the first time, use
  variants 1–3.

---

## Vernacular

Terms that carry meaning and should be used consistently rather than paraphrased.

| Term | Means | Where |
|---|---|---|
| **Line of enquiry** | One `::section` block in `/prepare` — a question plus the reason a board or auditor asks it | `/prepare` UI, prepare spec |
| **Pack** | A completed `/prepare` artefact | `/prepare`, `/account` |
| **The Brief** | The narrated daily findings surface | Route `/`, nav |
| **Quiet day** | Nothing cleared the materiality floor | Brief and signals empty states |
| **As at** | The date a fact was true | Every provenance rail |
| **Stated absence** | A fact known to be missing, rendered rather than hidden | Register, signals, prepare appendix |

"Line of enquiry" is audit vocabulary and is structurally incapable of implying a
recommendation, which is why it is worth using in preference to "question", "step" or
"prompt". It also teaches the subscriber what kind of thing they are using before they read a
word of the content.

---

## Words to avoid

**Restricted by law.** "Financial adviser" and "financial planner" are restricted terms under
s923C of the Corporations Act. Never use them of BTS, the product, or any agent.

**Wrong for an AR positioned on independence.** Advice, recommend, should, best, top,
leading, optimal, guarantee, proven, edge, alpha, outperform, signal-as-a-verb. These imply
either a recommendation or a claim about outcomes, and the entire product is built on making
neither.

**Wrong for the audience.** Crypto, coin, HODL, moon, degen, ape, stack-sats framing, rocket
metaphors. The design brief already rules out the aesthetic; the vocabulary is the same rule
applied to words.

**House style, unchanged.** Australian English. Bitcoin capitalised for the network or
protocol, bitcoin lowercase for the unit. No exclamation marks. Humour and financial figures
never share a paragraph.
