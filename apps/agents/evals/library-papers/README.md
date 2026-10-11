# Library papers golden set

`golden-set.json` holds 40 hand-labelled papers for the Papers pipeline in
[`library-papers-spec.md`](../../../../docs/features/client-app/library-papers-spec.md). Session 2 scores
`paperResolve` against it. Session 3's scorers use the papers marked `read_here`.

Acceptance, from the spec's build sequence:

- relevance tier matches on at least 36 of 40;
- access tier matches on 40 of 40 (it is deterministic, so a miss is a bug in the code or in a label);
- no duplicates when the watch runs again over the same identifiers.

## What is in it

| | Count |
| --- | --- |
| `read_here` / `read_at_source` / `abstract_only` / `metadata_only` | 21 / 8 / 3 / 8 |
| `core` / `substantial` / `peripheral` / `excluded` | 24 / 6 / 5 / 5 |
| `peer_reviewed` / `preprint` / `not_peer_reviewed` | 35 / 1 / 4 |
| Would publish (peer reviewed and `core` or `substantial`) | 26 |

The `read_here` half is mostly *Ledger* (CC BY 4.0), plus PLOS ONE, Frontiers, MDPI, SAGE Open,
Royal Society Open Science and Financial Innovation.

Edge cases each have their own entry:

- a version pair: preprint gs-37 → published gs-15;
- a working paper with a different licence from its published version (gs-38 → gs-29);
- a correction (gs-08);
- a retraction (gs-30);
- a bronze free copy (gs-25);
- a CC BY-NC-ND copy (gs-24);
- a law journal (gs-39);
- an editorial (gs-36);
- three records with no DOI (gs-38, gs-39, gs-40).

## Labelling rules

**Peer review.** A refereed journal article or refereed proceedings paper, in its published or accepted
version. Preprints, working papers, editorials and student-edited law journals are not peer reviewed.

**Relevance.** These follow the spec's tier table, judged from the title and abstract with the full text as
a tiebreak:

- `core`: bitcoin is the object of study.
- `substantial`: bitcoin is one of a few subjects and has its own findings.
- `peripheral`: bitcoin is one item among many, or is mentioned only in passing.
- `excluded`: bitcoin is absent from the abstract, or the paper is altcoin-only.

**Access.** Taken from the copies listed on each entry:

1. `read_here`: any copy carries CC BY, CC BY-SA or CC0.
2. `read_at_source`: otherwise, any free copy of the published or accepted version, under any other licence
   or none.
3. `abstract_only`: no free copy, and the publisher supports the
   [Initiative for Open Abstracts](https://leidenmadtrics.nl/articles/the-initiative-for-open-abstracts-celebrating-our-first-anniversary).
4. `metadata_only`: no free copy, and the publisher does not support it.

A working paper or preprint is a separate work. It never lifts the tier of its published version.

Rules 3 and 4 assume the abstract policy recommended on 10 October 2026: default to `summary_only`,
and show an abstract verbatim only when the publisher supports I4OA. The spec branch still defaults
`abstract_policy` to `display`. If that stays, the seven peer-reviewed `metadata_only` papers become
`abstract_only`.

## How each label was checked

Each entry lists the pages it was checked against, with `checkedOn: 2026-10-11`. The check used
publisher, repository and RePEc pages, because the OpenAlex and Crossref APIs were not reachable from the
build session.

The 16 entries with a `recheck` field (gs-21 to gs-36) are the closed and non-CC BY papers. For those,
"no free copy" or "no licence" means that none was found, not that none exists. Once the
OpenAlex key is registered in Session 0, look each one up once by DOI. If OpenAlex disagrees, read the
copy it reports before changing a label.

Two licences are inferred rather than read from the article page:

- gs-18 (Financial Innovation): the journal is fully open access.
- gs-20: the co-publisher's metadata states CC BY 3.0.

Both carry a `licenceNote`.

## Open decision

gs-17 is a crypto-generic accounting paper. Bitcoin is not named in its abstract, but the treatment
applies to bitcoin holdings. It is labelled `substantial` and carries `needsDecision`, because the tier
table as written would make it `peripheral`. Whichever way that goes, the same call applies to every
accounting and regulation paper like it.
