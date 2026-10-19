# OpenAlex recheck of the golden set

**Date:** 2026-10-18
**Status:** Applied. Every label change below, and the gs-20 decision (`metadata_only`), is in [`golden-set.json`](./golden-set.json), dated 2026-10-18. The rest of this report is the record as written before they were applied. gs-21 and gs-22 later gained `isOa: true` on their Southampton copies, which this report's evidence supports.
**OpenAlex requests:** 42. That is 37 DOI lookups, 3 title searches (gs-38, gs-39, gs-40) and 2 rate-limit checks. All returned 200.
**Credits used:** 30 of the 10,000 daily allowance. The three searches cost 10 each, and singleton lookups are free. 9,963 credits remained afterwards.

The access tier was computed from OpenAlex's `locations[]` using the rules in [README.md](./README.md#labelling-rules).
For a peer-reviewed paper only its published and accepted copies count. A work that is itself a preprint or working paper
is judged on its own copies. Labels were not changed. Every disagreement below was checked against the copy itself or
against the publisher's own Crossref deposit, and the proposed changes are listed for a person to apply.

Several publisher sites refuse automated requests (OUP, Taylor & Francis, SSRN, ScienceDirect), and Southampton's
ePrints refuses its HTML pages. Where that happened, the evidence is the publisher's licence deposit in Crossref
(`api.crossref.org/works/<doi>`) or Southampton's own EPrints export, and the evidence column says so.

## Entries

| Entry | OpenAlex id | Expected tier | Computed tier | Match | Note |
| --- | --- | --- | --- | --- | --- |
| gs-01 | `W2766522683` | `read_here` | `read_here` | yes |  |
| gs-02 | `W2684611407` | `read_here` | `read_here` | yes |  |
| gs-03 | `W2752685521` | `read_here` | `read_here` | yes |  |
| gs-04 | `W2737898592` | `read_here` | `read_here` | yes |  |
| gs-05 | `W2948297784` | `read_here` | `read_here` | yes |  |
| gs-06 | `W2965460652` | `read_here` | `read_here` | yes |  |
| gs-07 | `W3197440365` | `read_here` | `read_here` | yes |  |
| gs-08 | `W2884644642` | `read_here` | `read_here` | yes |  |
| gs-09 | `W2621187651` | `read_here` | `read_here` | yes |  |
| gs-10 | `W2780738242` | `read_here` | `read_here` | yes |  |
| gs-11 | `W2778808321` | `read_here` | `read_here` | yes |  |
| gs-12 | `W2748470613` | `read_here` | `read_here` | yes |  |
| gs-13 | `W2162338668` | `read_here` | `read_here` | yes |  |
| gs-14 | `W3014288492` | `read_here` | `read_here` | yes |  |
| gs-15 | `W3198344353` | `read_here` | `read_here` | yes |  |
| gs-16 | `W3029206523` | `read_here` | `read_here` | yes |  |
| gs-17 | `W4386134162` | `read_here` | `read_here` | yes |  |
| gs-18 | `W4408597036` | `read_here` | `read_here` | yes |  |
| gs-19 | `W2768283313` | `read_here` | `read_here` | yes |  |
| gs-20 | `W4212832141` | `read_here` | `metadata_only` | no | Unclear: OpenAlex and Crossref show no CC licence; JCST page meta says CC BY 3.0 |
| gs-21 | `W2523675164` | `read_at_source` | `read_at_source` | yes |  |
| gs-22 | `W3138333603` | `read_at_source` | `metadata_only` | no | OpenAlex wrong: Southampton accepted manuscript is public |
| gs-23 | `W2799345028` | `read_at_source` | `metadata_only` | no | Tier holds; label wrong on retraction and licence |
| gs-24 | `W2809373714` | `read_at_source` | `read_at_source` | yes | Tier holds; OpenAlex reads SSRN as the published version |
| gs-25 | `W3124611303` | `read_at_source` | `read_at_source` | yes |  |
| gs-26 | `W2339420092` | `abstract_only` | `abstract_only` | yes |  |
| gs-27 | `W4405331752` | `abstract_only` | `abstract_only` | yes |  |
| gs-28 | `W3138950545` | `abstract_only` | `read_at_source` | no | Label wrong: OUP version of record is CC BY-NC 4.0 |
| gs-29 | `W2145501956` | `metadata_only` | `metadata_only` | yes |  |
| gs-30 | `W3161427439` | `metadata_only` | `metadata_only` | yes |  |
| gs-31 | `W4399035645` | `metadata_only` | `metadata_only` | yes |  |
| gs-32 | `W3201381514` | `metadata_only` | `metadata_only` | yes |  |
| gs-33 | `W2793599258` | `metadata_only` | `metadata_only` | yes |  |
| gs-34 | `W3193158160` | `metadata_only` | `metadata_only` | yes |  |
| gs-35 | `W4281249322` | `metadata_only` | `read_at_source` | no | OpenAlex wrong: SSRN copy is a preprint |
| gs-36 | `W4389670457` | `metadata_only` | `read_here` | no | Label wrong: T&F version of record is CC BY 4.0 |
| gs-37 | — | `read_here` | `read_here` | yes | DOI resolves to gs-15’s record W3198344353; no id added |
| gs-38 | — | `read_at_source` | — | n/a | Not in OpenAlex; title search returned gs-29’s article |
| gs-39 | — | `read_at_source` | — | n/a | Not in OpenAlex |
| gs-40 | — | `read_at_source` | — | n/a | Not in OpenAlex (only later reprints) |

## Disagreements

### Label wrong: proposed changes, not applied

| Entry | Field | From | To | Evidence |
| --- | --- | --- | --- | --- |
| gs-23 | `expected.isRetracted` | `false` | `true` | The Crossref record is retitled "RETRACTED: Cryptocurrencies as a financial asset…" and carries a publisher `update-to` of type `retraction`. The retraction notice is [10.1016/j.irfa.2026.105078](https://doi.org/10.1016/j.irfa.2026.105078) (February 2026, also recorded by Retraction Watch, record 68876). OpenAlex `is_retracted: true` agrees |
| gs-23 | `expected.bestLicence` | `null` | `cc-by-nc-nd` | Southampton's EPrints export for [eprints.soton.ac.uk/425053](https://eprints.soton.ac.uk/425053) lists the file as `content: accepted`, `security: public`, `license: cc_by_nc_nd_4`. The tier stays `read_at_source`, and the Southampton copy's `licence` in `copies[]` should change to match |
| gs-28 | `expected.accessTier` | `abstract_only` | `read_at_source` | OUP deposited `https://creativecommons.org/licenses/by-nc/4.0/` for the version of record from 2021-03-13 ([Crossref](https://api.crossref.org/works/10.1093/restud/rdab014)). OpenAlex reports the same, with a free PDF at [academic.oup.com](https://academic.oup.com/restud/article-pdf/88/6/3011/41901340/rdab014.pdf). NC is not rehostable, so it is `read_at_source`, not `read_here` |
| gs-28 | `expected.bestLicence` | `null` | `cc-by-nc` | As above. Also add the publisher copy to `copies[]` with `isOa: true` |
| gs-36 | `expected.accessTier` | `metadata_only` | `read_here` | Taylor & Francis deposited `http://creativecommons.org/licenses/by/4.0/` for the version of record from 2023-12-13 ([Crossref](https://api.crossref.org/works/10.1080/1351847X.2023.2284186)). Birmingham's repository holds the "Final published version" under "Creative Commons: Attribution (CC BY)" ([research.birmingham.ac.uk](https://research.birmingham.ac.uk/en/publications/cryptocurrency-research-future-directions/)). The entry is an editorial and `not_peer_reviewed`, so it still never publishes; the tier is still a fact about it |
| gs-36 | `expected.bestLicence` | `null` | `cc-by` | As above |

gs-23, gs-28 and gs-36 keep `checkedOn: 2026-10-11` until these are applied.

### OpenAlex wrong: label kept

| Entry | What OpenAlex says | What the copy says |
| --- | --- | --- |
| gs-22 | The Southampton accepted version is closed, so the computed tier is `metadata_only` | Southampton's EPrints export for [447739](https://eprints.soton.ac.uk/447739) lists the file as `content: accepted`, `security: public` and `license: accepted_manuscript`, with no embargo. It is a free accepted copy with no CC licence, which is the label's `read_at_source` |
| gs-23 | The Southampton copy is a `submittedVersion`, so it does not count | The same export lists it as `content: accepted`. The tier stays `read_at_source` (the licence is under "Label wrong") |
| gs-24 | An SSRN copy ([10.2139/ssrn.3171204](https://doi.org/10.2139/ssrn.3171204)) is the free `publishedVersion` with no licence, and the LSE accepted versions are closed | SSRN hosts working papers, not the version of record. LSE's page ([researchonline.lse.ac.uk/id/eprint/100409](https://researchonline.lse.ac.uk/id/eprint/100409/)) shows "Accepted Version · Creative Commons: Attribution-Noncommercial-No Derivative Works 4.0 · Download". The tier matches and the label's `cc-by-nc-nd` is right |
| gs-35 | An SSRN copy ([10.2139/ssrn.4080372](https://doi.org/10.2139/ssrn.4080372)) is a free `acceptedVersion`, so the computed tier is `read_at_source` | The depositor typed it in Crossref as `posted-content` / `preprint`. A preprint is a separate work and never lifts the published paper, so it stays `metadata_only`. SSRN refused the page itself, so this rests on the Crossref type |

### Unclear: left for a person

- **gs-20 (Springer / JCST).** The label is `read_here` / `cc-by`, from the `licenceNote` saying the co-publisher's
  metadata lists CC BY 3.0. That is true: [jcst.ict.ac.cn](https://jcst.ict.ac.cn/article/doi/10.1007/s11390-021-1674-4)
  carries `<meta name="dc.rights" content="http://creativecommons.org/licenses/by/3.0/">`. But the same page's
  footer reads "2026 JCST, All Rights Reserved", Springer's Crossref deposit carries only its text-and-data-mining
  licence (`https://www.springer.com/tdm`, [Crossref](https://api.crossref.org/works/10.1007/s11390-021-1674-4)),
  and OpenAlex lists one closed copy. The meta tag looks like a site template rather than a licence on this
  article. If so, the tier is `metadata_only` (or `abstract_only`, depending on Springer's I4OA status, which the
  entry does not record). The entry is `excluded` on relevance, so it never publishes either way.
- **gs-37 (preprint of gs-15).** Its DOI `10.20944/preprints202108.0555.v1` resolves to `W3198344353`, which is
  gs-15's published article. OpenAlex has merged the preprint into it, listing Preprints.org as an
  `acceptedVersion` location. No `openalexId` was added, because two entries cannot share one. This matters for
  Session 2. The spec deduplicates on DOI, then OpenAlex ID, then arXiv ID, and `papers.openalex_id` is unique, so
  resolving the preprint DOI through OpenAlex would fold gs-37 into gs-15. The `published_version_of` pair this
  entry exists to test would then have nothing to connect.
- **gs-38 (working paper of gs-29).** The title search found `W2145501956` with the exact title, year 2015 and the
  same sole author. That is gs-29's *Finance Research Letters* article, which OpenAlex dates 2015. The three-part
  match rule could not tell the two apart, so it is recorded as not in OpenAlex. Session 2's matcher needs a
  stronger rule than title, year and first author.

## Not found

- **gs-38:** see above. There is no separate OpenAlex work for the UCD working paper.
- **gs-39** (Hastings Science & Technology Law Journal): no result with the exact title.
- **gs-40** (the Bitcoin whitepaper): only later re-publications under the same title (2019, 2022, 2024, 2026),
  none matching the entry's year and author. No match was accepted.

## Totals

- **Access tier:** 31 of 40 match. Of those, 30 match on the entry's own OpenAlex record. The 31st, gs-37, matches only
  because its DOI resolves to gs-15's record. There are 6 disagreements (gs-20, 22, 23, 28, 35, 36) and 3 entries
  not found.
- **After checking the copies:** 3 labels are wrong (gs-23 on retraction and licence, gs-28, gs-36), 3
  disagreements are OpenAlex errors (gs-22, gs-24's licence, gs-35), and 1 is unclear (gs-20).
- **Retraction flags:** 36 of 37 looked up by DOI match. The one miss is gs-23, where OpenAlex is right.
- **Entries not found:** 3 (gs-38, gs-39, gs-40).
