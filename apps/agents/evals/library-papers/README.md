# Library papers golden set

`golden-set.json` holds 40 hand-labelled papers for the Papers pipeline in
[`library-papers-spec.md`](../../../../docs/features/client-app/library-papers-spec.md). Session 2 scores
`paperResolve` against it. Session 3's scorers use the papers marked `read_here`.

Acceptance, from the spec's build sequence:

- relevance tier matches on at least 36 of 40;
- access tier matches on 40 of 40, computed with the spec's
  [source reconciliation rules](../../../../docs/features/client-app/library-papers-spec.md#source-reconciliation-rules),
  so every entry with a `knownSourceError` comes out right despite OpenAlex;
- no duplicates when the watch runs again over the same identifiers.

## What is in it

| | Count |
| --- | --- |
| `read_here` / `read_at_source` / `metadata_only` | 21 / 9 / 10 |
| `core` / `substantial` / `peripheral` / `excluded` | 24 / 7 / 4 / 5 |
| `peer_reviewed` / `preprint` / `not_peer_reviewed` | 35 / 1 / 4 |
| Would publish (peer reviewed and `core` or `substantial`) | 27 |

The `read_here` half is mostly *Ledger* (CC BY 4.0), plus PLOS ONE, Frontiers, MDPI, SAGE Open,
Royal Society Open Science and Financial Innovation.

Edge cases each have their own entry:

- a preprint OpenAlex has merged into its published version (gs-37 into gs-15; `expectedResolution`);
- a working paper with a different licence from its published version (gs-38 → gs-29);
- a correction (gs-08);
- two retractions, one closed (gs-30) and one with a free copy (gs-23);
- a bronze free copy (gs-25);
- non-commercial licences: CC BY-NC on the version of record (gs-28), CC BY-NC-ND on accepted
  manuscripts (gs-23, gs-24);
- a law journal (gs-39);
- an editorial (gs-36);
- three records with no DOI (gs-38, gs-39, gs-40).

## Labelling rules

**Peer review.** A refereed journal article or refereed proceedings paper, in its published or accepted
version. Preprints, working papers, editorials and student-edited law journals are not peer reviewed.

**Relevance.** These follow the spec's tier table, judged from the title and abstract with the full text as
a tiebreak:

- `core`: bitcoin is the object of study.
- `substantial`: bitcoin is one of a few subjects and has its own findings. Also crypto-generic papers
  whose findings apply directly to holding or using bitcoin: accounting, tax, regulation, custody,
  security (decided 11 October 2026; gs-08 and gs-17).
- `peripheral`: bitcoin is one item among many, or is mentioned only in passing.
- `excluded`: bitcoin is absent from the abstract, or the paper is altcoin-only.

**Access.** Taken from the copies listed on each entry:

1. `read_here`: any published or accepted copy carries CC BY, CC BY-SA, CC0 or public domain (for a
   preprint or working paper, any of its own copies).
2. `read_at_source`: otherwise, any free copy of the published or accepted version, under any other licence
   or none.
3. `metadata_only`: no free copy.

A working paper or preprint is a separate work. It never lifts the tier of its published version.

There is no `abstract_only` tier. Under the spec's
[abstract policy](../../../../docs/features/client-app/library-papers-spec.md#abstract-policy) a publisher
abstract is shown only for `read_here` papers, so a closed paper is always `metadata_only` (decided
18 October 2026). gs-26 and gs-27 were `abstract_only` until then.

## How each label was checked

Labels were first set on 2026-10-11 from publisher, repository and RePEc pages. On 2026-10-18 every
entry with an identifier was looked up in OpenAlex, and every disagreement was settled by reading the copy
itself or the publisher's Crossref licence deposit; see [`openalex-recheck.md`](./openalex-recheck.md).
That recheck changed four labels:

- gs-20 became `metadata_only`: its CC BY tag was site template, not an article licence.
- gs-23 is retracted, and its free copy is CC BY-NC-ND.
- gs-28 became `read_at_source`: CC BY-NC on the version of record.
- gs-36 became `read_here`: CC BY on the version of record.

gs-39 and gs-40 are not in OpenAlex and keep their 2026-10-11 check.

## Known source errors

Six entries carry a `knownSourceError`: what OpenAlex reports and why the label differs. They are
there so the pipeline is tested against OpenAlex as it really is, not as it should be.

| Entry | OpenAlex error | Rule that handles it |
| --- | --- | --- |
| gs-22 | Calls a public repository accepted manuscript closed | Confirm repository copies at the repository |
| gs-23 | Calls an accepted manuscript a submitted version | Confirm repository copies at the repository |
| gs-24, gs-35 | Treats SSRN working papers and preprints as published or accepted copies | SSRN never counts as published or accepted |
| gs-37 | Merges the preprint into its published work, as an accepted version | A different-DOI hit becomes a copy, not a paper |
| gs-38 | Title search returns the journal article for the working paper | Never accept a title match on its own |

gs-28 and gs-36 are not OpenAlex errors, but they are why the pipeline also reads the publisher's
Crossref licence deposit: my original labels missed both.

One licence is still inferred rather than read from the article page: gs-18 (Financial Innovation), from
the journal being fully open access. It carries a `licenceNote`.
