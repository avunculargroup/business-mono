/**
 * The fixture set.
 *
 * **Phase 5 placeholders.** These exist to prove the wiring — enough rows for
 * pagination to have a boundary and for each surface to render something real —
 * and they are deliberately not the curated set. The staged narrative, the
 * numbers, and every word of prose are Phase 6, after a Lex pass. Anything here
 * that reads like a claim about Bitcoin or about BTS is a placeholder that
 * should be replaced rather than edited.
 *
 * Everything is a function of the anchor rather than a constant, because dates
 * resolve against `ReadContext.asOf` at read time — see `anchor.ts`.
 */
import type {
  AgentActivityItem,
  CompanyContact,
  CompanySummary,
  ContentCard,
  ContentDetail,
  DashboardIndicators,
  EcosystemChange,
  MarketReportDetail,
  NewsFeedItem,
  NewsItemDetail,
  WatchHealth,
} from '@platform/data';
import { at, onDate, todayAt } from './anchor';

export function agentActivity(anchor: Date): AgentActivityItem[] {
  return [
    {
      id: 'act-1',
      agentName: 'simon',
      action: 'Dispatch to rex: scan overnight regulatory sources',
      status: 'auto',
      triggerType: 'schedule',
      createdAt: todayAt(anchor, 6),
      entityType: null,
      entityId: null,
      proposedActions: [],
      approvedResponse: null,
      workflowRunId: null,
    },
    {
      id: 'act-2',
      agentName: 'charlie',
      action: 'Draft a LinkedIn post from the research digest',
      status: 'pending',
      triggerType: 'manual',
      createdAt: at(anchor, -1),
      entityType: 'content_item',
      entityId: 'cnt-1',
      proposedActions: [
        { type: 'create', label: 'Create a LinkedIn draft' },
        { type: 'notify', label: 'Notify the directors when drafted' },
      ],
      approvedResponse: null,
      workflowRunId: 'run-placeholder-1',
    },
    {
      id: 'act-3',
      agentName: 'petra',
      action: 'Triage the task backlog',
      status: 'approved',
      triggerType: 'schedule',
      createdAt: at(anchor, -2),
      entityType: null,
      entityId: null,
      proposedActions: [],
      approvedResponse: 'Approved — proceed.',
      workflowRunId: null,
    },
  ];
}

export function newsFeed(anchor: Date): NewsFeedItem[] {
  return [
    {
      id: 'news-1',
      title: 'Placeholder: regulator publishes updated digital asset guidance',
      url: 'https://example.test/guidance',
      imageUrl: null,
      sourceName: 'Placeholder Regulator Watch',
      // Today, on the anchor's own calendar day: `listTodayDigest` bands by it,
      // so without a same-day item the demo's digest is permanently empty.
      publishedAt: todayAt(anchor, 7),
      summary: 'Placeholder summary. Replaced with curated copy in Phase 6.',
      category: 'regulatory',
      status: 'new',
      relevanceScore: 0.86,
      curatorNotes: null,
    },
    {
      id: 'news-2',
      title: 'Placeholder: central bank holds its policy rate',
      url: 'https://example.test/rates',
      imageUrl: null,
      sourceName: 'Placeholder Wire',
      publishedAt: todayAt(anchor, 5),
      summary: 'Placeholder summary.',
      category: 'macro',
      status: 'reviewed',
      relevanceScore: 0.61,
      curatorNotes: 'Placeholder curator note — this is the annotated surface.',
    },
    {
      id: 'news-3',
      title: 'Placeholder: an offshore regulator consults on custody rules',
      url: 'https://example.test/attestation',
      imageUrl: null,
      sourceName: 'Placeholder Wire',
      publishedAt: at(anchor, -4),
      summary: 'Placeholder summary.',
      category: 'international',
      status: 'new',
      relevanceScore: 0.44,
      curatorNotes: null,
    },
  ];
}

export function newsItems(anchor: Date): NewsItemDetail[] {
  return newsFeed(anchor).map((item) => ({
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
    bodyMarkdown: 'Placeholder body. Replaced with curated copy in Phase 6.',
    report: null,
  }));
}

export function contentCards(): ContentCard[] {
  return [
    {
      id: 'cnt-1',
      slug: 'placeholder-draft',
      title: 'Placeholder: a draft awaiting review',
      type: 'linkedin',
      status: 'draft',
      scheduledFor: null,
      publishError: null,
      createdBy: 'charlie',
      campaignName: null,
      accountName: null,
      platform: 'linkedin',
    },
    {
      id: 'cnt-2',
      slug: 'placeholder-published',
      title: 'Placeholder: something already published',
      type: 'linkedin',
      status: 'published',
      scheduledFor: null,
      publishError: null,
      createdBy: 'charlie',
      campaignName: null,
      accountName: 'BTS',
      platform: 'linkedin',
    },
  ];
}

export function contentDetails(anchor: Date): ContentDetail[] {
  return contentCards().map((card) => ({
    id: card.id,
    title: card.title,
    type: card.type,
    status: card.status,
    body: 'Placeholder body. Replaced with curated copy in Phase 6.',
    isThread: false,
    socialAccountId: null,
    scheduledFor: null,
    publishedAt: card.status === 'published' ? at(anchor, -3) : null,
    publishError: null,
    createdAt: at(anchor, -5),
    updatedAt: at(anchor, -3),
    threadSegments: [],
    priorFeedback: [],
    maxChars: 3000,
  }));
}

export function companies(anchor: Date): CompanySummary[] {
  return [
    {
      id: 'co-1',
      slug: 'placeholder-holdings',
      name: 'Placeholder Holdings',
      industry: 'Professional services',
      size: 'SME',
      website: 'https://example.test',
      linkedinUrl: null,
      notes: null,
      createdAt: at(anchor, -40),
    },
    {
      id: 'co-2',
      slug: 'placeholder-industrial',
      name: 'Placeholder Industrial',
      industry: 'Manufacturing',
      size: 'Mid-market',
      website: null,
      linkedinUrl: null,
      notes: null,
      createdAt: at(anchor, -18),
    },
  ];
}

export function companyContacts(): Record<string, CompanyContact[]> {
  return {
    'co-1': [
      {
        id: 'ct-1',
        slug: 'placeholder-cfo',
        firstName: 'Placeholder',
        lastName: 'Contact',
        pipelineStage: 'qualified',
        email: 'contact@example.test',
      },
    ],
    'co-2': [],
  };
}

export function marketReports(anchor: Date): MarketReportDetail[] {
  return [
    {
      id: 'mr-1',
      asOf: onDate(anchor, -1),
      status: 'published',
      narrationMarkdown: 'Placeholder narration. Replaced with curated copy in Phase 6.',
      emailed: true,
      isQuietDay: false,
      findings: [],
      priorFeedback: [],
    },
    {
      // The quiet-day path: nothing cleared the materiality floor, so there is
      // no narration to show. One of the two principles this surface carries,
      // and it needs a row or the demo cannot show it.
      id: 'mr-2',
      asOf: onDate(anchor, -2),
      status: 'published',
      narrationMarkdown: null,
      emailed: true,
      isQuietDay: true,
      findings: [],
      priorFeedback: [],
    },
    {
      id: 'mr-3',
      asOf: onDate(anchor, -3),
      status: 'held',
      narrationMarkdown: 'Placeholder narration that failed review.',
      emailed: false,
      isQuietDay: false,
      findings: [],
      priorFeedback: [],
    },
  ];
}

export function indicators(anchor: Date): DashboardIndicators {
  return {
    macroLatest: [
      {
        indicatorId: 'ind-1',
        name: 'Placeholder CPI',
        shortLabel: 'CPI',
        category: 'inflation',
        region: 'AU',
        unit: '%',
        decimals: 1,
        periodDate: onDate(anchor, -50),
        periodGranularity: 'quarterly',
        releasedAt: onDate(anchor, -20),
        daysSinceRelease: 20,
        expectedNextRelease: onDate(anchor, 70),
        typicalReleaseGapDays: 91,
        currentValue: 3.2,
        priorValue: 3.6,
        changeSincePrior: -0.4,
        pctChangeSincePrior: -11.1,
        yearAgoPeriod: onDate(anchor, -415),
        yearAgoValue: 4.1,
        yoyChange: -0.9,
        yoyPctChange: -21.9,
        isRevision: false,
        supersededValue: null,
      },
    ],
    macroSeries: [
      {
        indicatorId: 'ind-1',
        shortLabel: 'CPI',
        periodDate: onDate(anchor, -140),
        releasedAt: onDate(anchor, -110),
        value: 3.6,
      },
      {
        indicatorId: 'ind-1',
        shortLabel: 'CPI',
        periodDate: onDate(anchor, -50),
        releasedAt: onDate(anchor, -20),
        value: 3.2,
      },
    ],
    onchainLatest: [
      {
        key: 'hash_rate',
        name: 'Placeholder hash rate',
        shortLabel: 'Hash',
        metricGroup: 'network',
        unit: 'EH/s',
        decimals: 0,
        observedAt: onDate(anchor, -1),
        daysSinceObserved: 1,
        value: 720,
        changeSincePrior: -62,
        pctChangeSincePrior: -7.9,
        signal: null,
      },
    ],
    onchainSeries: [
      {
        indicatorId: 'ind-9',
        key: 'hash_rate',
        shortLabel: 'Hash',
        observedAt: onDate(anchor, -2),
        value: 782,
      },
      {
        indicatorId: 'ind-9',
        key: 'hash_rate',
        shortLabel: 'Hash',
        observedAt: onDate(anchor, -1),
        value: 720,
      },
    ],
  };
}

export function ecosystemChanges(anchor: Date): EcosystemChange[] {
  return [
    {
      id: 'ch-1',
      changeType: 'release',
      title: 'Placeholder: a monitored project published a release',
      summary: 'Placeholder summary.',
      severity: 'minor',
      materiality: 2,
      // Neutral, so the demo can show a change that *is* promotable.
      complianceClass: 'neutral',
      status: 'new',
      pinned: false,
      clientRelevant: false,
      curatorNote: null,
      occurredAt: at(anchor, -1),
      detectedAt: at(anchor, -1),
      externalUrl: 'https://example.test/release',
      entityName: 'Placeholder Project',
      productServiceId: 'ps-1',
      advisorPartnerId: null,
      productSlug: 'placeholder-project',
      advisorSlug: null,
      watchLabel: 'Placeholder releases',
      watchType: 'github_release',
    },
    {
      // Compliance-sensitive, so the demo can show the gate refusing. Without
      // this row `compliance-as-alignment` is an annotation with nothing behind
      // it on screen.
      id: 'ch-2',
      changeType: 'pricing',
      title: 'Placeholder: a provider changed its fee schedule',
      summary: 'Placeholder summary.',
      severity: 'major',
      materiality: 4,
      complianceClass: 'general_advice',
      status: 'new',
      pinned: false,
      clientRelevant: false,
      curatorNote: 'Placeholder curator note.',
      occurredAt: at(anchor, -3),
      detectedAt: at(anchor, -3),
      externalUrl: null,
      entityName: 'Placeholder Provider',
      productServiceId: 'ps-2',
      advisorPartnerId: null,
      productSlug: 'placeholder-provider',
      advisorSlug: null,
      watchLabel: 'Placeholder pricing page',
      watchType: 'page_diff',
    },
  ];
}

export function watchHealth(anchor: Date): WatchHealth[] {
  return [
    {
      id: 'w-1',
      label: 'Placeholder releases',
      watchType: 'github_release',
      health: 'healthy',
      checkFrequency: 'daily',
      consecutiveFailures: 0,
      lastCheckedAt: at(anchor, -0.5),
      lastChangeAt: at(anchor, -1),
      daysSinceCheck: 0,
      entityName: 'Placeholder Project',
      ownerName: 'Placeholder Director',
    },
    {
      id: 'w-2',
      label: 'Placeholder pricing page',
      watchType: 'page_diff',
      health: 'stale',
      checkFrequency: 'daily',
      consecutiveFailures: 2,
      lastCheckedAt: at(anchor, -9),
      lastChangeAt: at(anchor, -3),
      daysSinceCheck: 9,
      entityName: 'Placeholder Provider',
      ownerName: 'Placeholder Director',
    },
  ];
}
