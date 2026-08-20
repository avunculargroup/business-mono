import type { ContentCard, ContentDetail, PublishGate } from '@platform/data';
import { at } from './anchor';

/**
 * The content pipeline.
 *
 * Staged around the publish gate: a draft on one side, a published item on the
 * other, and — the row that carries the most weight — one held by a compliance
 * verdict with a stated reason. Compliance being a gate with a reason rather
 * than a checkbox is, for a business operating as an Authorised Representative,
 * the whole point.
 *
 * ## Where the flagged verdict shows
 *
 * `ContentCard` carries `status` but not `complianceStatus`; the verdict lives
 * on `PublishGate`, which is read when someone tries to publish. So the flagged
 * item appears in the list as `review` and reveals *why* it is stuck when the
 * gate is asked. That is the app's real shape rather than a fixture
 * convenience — the list is a board, the gate is the decision — but it does
 * mean the staging table's "Lex flagged" row is only half visible on the list
 * screen. See the Phase 6 notes in `build-progress.md`.
 *
 * ## Prose rules
 *
 * Drafts are written to brand voice: plain, no exclamation marks, sentence
 * case, capital-B Bitcoin for the network and lowercase for the unit, none of
 * the banned terminology. The flagged draft is deliberately written to *fail* —
 * it is the one piece of prose here that is supposed to read as a view rather
 * than an observation, because that is what makes the verdict legible.
 */

interface ContentFixture {
  card: ContentCard;
  detail: Omit<ContentDetail, 'id' | 'title' | 'type' | 'status'>;
  gate: Omit<PublishGate, 'status' | 'type' | 'body' | 'isThread'>;
}

function fixtures(anchor: Date): ContentFixture[] {
  return [
    {
      // ── Before the gate.
      card: {
        id: 'cnt-custody-draft',
        slug: 'custody-post-mortem-draft',
        title: 'What a good custody post-mortem looks like',
        type: 'linkedin',
        status: 'draft',
        scheduledFor: null,
        publishError: null,
        createdBy: 'charlie',
        campaignName: null,
        accountName: null,
        platform: 'linkedin',
      },
      detail: {
        body: [
          'A custody provider published a post-mortem this week describing a signing key that',
          'sat briefly on a machine outside its documented boundary during a scheduled rotation.',
          'No loss, no unauthorised signature, and a clear account of how they found it.',
          '',
          'The disclosure is the interesting part. A provider that publishes the near-miss is',
          'telling you what their internal process actually catches. One that publishes nothing',
          'is telling you nothing at all, which is not the same as telling you it went well.',
          '',
          'Worth asking your own provider what their last one was.',
        ].join('\n'),
        isThread: false,
        socialAccountId: null,
        scheduledFor: null,
        publishedAt: null,
        publishError: null,
        createdAt: at(anchor, -1),
        updatedAt: at(anchor, -1),
        threadSegments: [],
        priorFeedback: [],
        maxChars: 3000,
      },
      gate: {
        approvedBy: null,
        complianceStatus: 'pending',
        socialAccountId: null,
        credentialExpiresAt: null,
        maxChars: 3000,
      },
    },
    {
      // ── The row that carries the surface. Written to fail, so the verdict
      // has something real to point at.
      card: {
        id: 'cnt-flagged',
        slug: 'treasury-cash-drag-flagged',
        title: 'Holding cash through a disinflation',
        type: 'linkedin',
        status: 'review',
        scheduledFor: null,
        publishError: null,
        createdBy: 'charlie',
        campaignName: null,
        accountName: 'BTS',
        platform: 'linkedin',
      },
      detail: {
        body: [
          'Trimmed-mean inflation eased for a third consecutive quarter. If your company is',
          'sitting on operating cash well beyond what the next twelve months need, now is the',
          'moment to move some of it into a harder reserve asset before the window closes.',
          '',
          'Companies that wait for certainty will be doing this at a worse entry point.',
        ].join('\n'),
        isThread: false,
        socialAccountId: 'acc-linkedin',
        scheduledFor: null,
        publishedAt: null,
        publishError: null,
        createdAt: at(anchor, -2),
        updatedAt: at(anchor, -2),
        threadSegments: [],
        priorFeedback: [
          {
            id: 'fb-flagged',
            verdict: 'negative',
            feedback:
              'This tells a reader what to do with their balance sheet and when. We are not licensed to do that, and "before the window closes" is a timing call on top of it. Rewrite as what the data did.',
            createdAt: at(anchor, -2),
          },
        ],
        maxChars: 3000,
      },
      gate: {
        approvedBy: null,
        // The verdict, with a reason attached in the feedback above. Not a
        // checkbox: something read this and said what was wrong with it.
        complianceStatus: 'flagged',
        socialAccountId: 'acc-linkedin',
        credentialExpiresAt: at(anchor, 40),
        maxChars: 3000,
      },
    },
    {
      // ── After the gate.
      card: {
        id: 'cnt-published',
        slug: 'what-a-quiet-day-looks-like',
        title: 'Most days, nothing happens',
        type: 'linkedin',
        status: 'published',
        scheduledFor: null,
        publishError: null,
        createdBy: 'charlie',
        campaignName: null,
        accountName: 'BTS',
        platform: 'linkedin',
      },
      detail: {
        body: [
          'Our daily market report ran this morning, computed its findings, scored them, and',
          'told us nothing material happened. That is the correct output for most days.',
          '',
          'A system that produces an insight every morning is not observing the market. It is',
          'producing insights, which is a different job and a much easier one.',
        ].join('\n'),
        isThread: false,
        socialAccountId: 'acc-linkedin',
        scheduledFor: null,
        publishedAt: at(anchor, -4),
        publishError: null,
        createdAt: at(anchor, -6),
        updatedAt: at(anchor, -4),
        threadSegments: [],
        priorFeedback: [],
        maxChars: 3000,
      },
      gate: {
        approvedBy: 'director',
        complianceStatus: 'cleared',
        socialAccountId: 'acc-linkedin',
        credentialExpiresAt: at(anchor, 40),
        maxChars: 3000,
      },
    },
    {
      // ── An idea, so the board's left-hand column is not empty and the
      // pipeline reads as a pipeline rather than a two-state toggle.
      card: {
        id: 'cnt-idea',
        slug: 'reconciliation-cycles-idea',
        title: 'Reconciliation cycles, and why the consultation matters',
        type: 'idea',
        status: 'idea',
        scheduledFor: null,
        publishError: null,
        createdBy: 'director',
        campaignName: null,
        accountName: null,
        platform: null,
      },
      detail: {
        body: null,
        isThread: false,
        socialAccountId: null,
        scheduledFor: null,
        publishedAt: null,
        publishError: null,
        createdAt: at(anchor, -1),
        updatedAt: at(anchor, -1),
        threadSegments: [],
        priorFeedback: [],
        maxChars: null,
      },
      gate: {
        approvedBy: null,
        complianceStatus: null,
        socialAccountId: null,
        credentialExpiresAt: null,
        maxChars: null,
      },
    },
  ];
}

export function contentCards(anchor: Date): ContentCard[] {
  return fixtures(anchor).map((fixture) => fixture.card);
}

export function contentDetails(anchor: Date): ContentDetail[] {
  return fixtures(anchor).map(({ card, detail }) => ({
    id: card.id,
    title: card.title,
    type: card.type,
    status: card.status,
    ...detail,
  }));
}

export function publishGates(anchor: Date): Record<string, PublishGate> {
  return Object.fromEntries(
    fixtures(anchor).map(({ card, detail, gate }) => [
      card.id,
      {
        status: card.status,
        type: card.type,
        body: detail.body,
        isThread: detail.isThread,
        ...gate,
      },
    ]),
  );
}
