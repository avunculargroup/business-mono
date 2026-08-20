import type { NewsFeedItem, NewsItemDetail } from '@platform/data';
import { at, todayAt } from './anchor';
import { SOURCES } from './entities';

/**
 * The research feed.
 *
 * Staged to make three things legible: that a human curator annotates what the
 * score missed, that the scorer rejects things, and that wholly different
 * ingestion paths land in one feed.
 *
 * ## Copyright and attribution rules
 *
 * Titles are invented and summaries are one-line paraphrases of a *generic*
 * event, never of a specific publisher's article. Reproducing publisher
 * content is a copyright problem before it is a compliance one.
 *
 * Sources are invented mastheads (`entities.ts`), and items concerning a
 * regulator say "a regulator" rather than naming one — an invented headline
 * attributed to a real institution is a fabricated record of a real
 * institution, which is worse than the naming problem the entity rules are
 * about.
 */

interface FeedFixture extends NewsFeedItem {
  /** Long-form body for the detail page. */
  body: string | null;
}

function items(anchor: Date): FeedFixture[] {
  return [
    {
      // ── The curator-notes principle. This is what separates the feed from
      // generic retrieval: the score is high, and a human still had something
      // to add that the score could not encode.
      id: 'news-consultation',
      title: 'Regulator opens consultation on custody obligations for held assets',
      url: 'https://southern-ledger.example.com/consultation-custody',
      imageUrl: null,
      sourceName: SOURCES.ledger,
      publishedAt: todayAt(anchor, 7),
      summary:
        'A consultation paper proposes tighter record-keeping duties for entities holding assets on behalf of clients. Submissions close in eight weeks.',
      category: 'regulatory',
      status: 'reviewed',
      relevanceScore: 0.91,
      curatorNotes:
        'The record-keeping clause is the part that matters to us, not the headline duty. Worth a submission — we hold nothing on behalf of clients, and saying so on the record is cheap.',
      body: [
        'A consultation paper proposes tighter record-keeping duties for entities that hold',
        'assets on behalf of clients, including a requirement to reconcile holdings against',
        'an independent record on a fixed cycle.',
        '',
        'Submissions close in eight weeks. The paper does not propose changes to the licensing',
        'regime itself.',
      ].join('\n'),
    },
    {
      // ── Same feed, wholly different ingestion path: this one arrived as a
      // paid email newsletter routed by plus-address, not by feed poll. The
      // synthetic `email://` URL is the convention the app already renders.
      id: 'news-newsletter',
      title: 'Weekly: fee market stays quiet into a sixth day',
      url: 'email://research-monetary-review/weekly-fee-market',
      imageUrl: null,
      sourceName: SOURCES.monetaryReview,
      publishedAt: todayAt(anchor, 5),
      summary:
        'A subscriber newsletter notes median transaction fees sitting at the low end of their quarterly range for most of the week.',
      category: 'macro',
      status: 'new',
      relevanceScore: 0.64,
      curatorNotes: null,
      body: [
        'A subscriber newsletter notes median transaction fees sitting at the low end of their',
        'quarterly range for most of the week, and attributes it to lower inscription activity',
        'rather than to any change in block space supply.',
        '',
        'Arrived by email rather than by feed. The sender was checked against the allowlist and',
        'the message passed SPF and DKIM before it was ingested.',
      ].join('\n'),
    },
    {
      // ── The scorer rejecting something. A scorer that only ever approves is
      // not a scorer, and a feed with no low scores in it cannot show that.
      id: 'news-low-relevance',
      title: 'Payments network adds a settlement partner in a market we do not operate in',
      url: 'https://harbourline-wire.example.com/settlement-partner',
      imageUrl: null,
      sourceName: SOURCES.harbourline,
      publishedAt: at(anchor, -2),
      summary:
        'A payments network announced a regional settlement partnership. No Australian entity is party to it.',
      category: 'international',
      // Not archived: the feed excludes archived items, and this row's whole
      // job is to be visible proof that the scorer rejects things. A scorer
      // whose rejections are hidden from the feed cannot be seen scoring.
      status: 'new',
      relevanceScore: 0.12,
      curatorNotes: null,
      body: null,
    },
    {
      // ── A high-materiality item with no curator note, so the pair above is
      // read as "a curator adds something" rather than "curated means good".
      id: 'news-custody-incident',
      title: 'Custody provider discloses a signing-key handling error in a post-mortem',
      url: 'https://custody-brief.example.com/post-mortem-signing',
      imageUrl: null,
      sourceName: SOURCES.custodyBrief,
      publishedAt: at(anchor, -3),
      summary:
        'A provider published a post-mortem describing a procedural error in how signing keys were handled during a scheduled rotation. No loss was reported.',
      category: 'corporate',
      status: 'promoted',
      relevanceScore: 0.83,
      curatorNotes: null,
      body: [
        'A provider published a post-mortem describing a procedural error during a scheduled',
        'key rotation, in which a signing key was held briefly on a machine outside the',
        'documented boundary. The provider reports no loss and no unauthorised signature.',
        '',
        'Promoted to the knowledge base under custody procedure.',
      ].join('\n'),
    },
    {
      // ── Archived, and therefore invisible on the feed. It exists so that
      // "the feed excludes archived items" is a claim with something behind it:
      // a filter with nothing to filter passes for the wrong reason.
      id: 'news-archived',
      title: 'Conference programme announced for an event we are not attending',
      url: 'https://harbourline-wire.example.com/conference-programme',
      imageUrl: null,
      sourceName: SOURCES.harbourline,
      publishedAt: at(anchor, -6),
      summary: 'An industry conference published its session list.',
      category: 'corporate',
      status: 'archived',
      relevanceScore: 0.08,
      curatorNotes: null,
      body: null,
    },
    {
      id: 'news-super-guidance',
      title: 'Guidance note clarifies asset-class reporting for self-managed funds',
      url: 'https://southern-ledger.example.com/smsf-reporting-note',
      imageUrl: null,
      sourceName: SOURCES.ledger,
      publishedAt: at(anchor, -5),
      summary:
        'A guidance note sets out how self-managed funds should categorise holdings that do not fit an existing reporting class.',
      category: 'regulatory',
      status: 'reviewed',
      relevanceScore: 0.77,
      curatorNotes:
        'Comes up in nearly every super conversation. Keep the reference handy rather than re-deriving it each time.',
      body: null,
    },
  ];
}

export function newsFeed(anchor: Date): NewsFeedItem[] {
  return items(anchor).map(({ body: _body, ...item }) => item);
}

export function newsItems(anchor: Date): NewsItemDetail[] {
  return items(anchor).map((item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    canonicalUrl: null,
    sourceName: item.sourceName,
    author: null,
    publishedAt: item.publishedAt,
    summary: item.summary,
    category: item.category,
    relevanceScore: item.relevanceScore,
    curatorNotes: item.curatorNotes,
    topicTags: [],
    bodyMarkdown: item.body,
    report: null,
  }));
}
