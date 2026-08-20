import { describe, expect, it } from 'vitest';
import {
  describeBundleContract,
  expectDescendingBy,
  expectNotFound,
  expectPaginationContract,
  expectWriteBlocked,
  testReadContext,
} from '@platform/data/testing';
import type { DemoDomain } from '@platform/data';
import { DEMO_DOMAINS } from '@platform/data';
import { createFixtureRepositories } from './bundle';

const ctx = testReadContext();

describeBundleContract<DemoDomain>({
  name: 'fixtures',
  expectedMode: 'demo',
  createBundle: () => createFixtureRepositories(),
});

describe('the fixture bundle', () => {
  it('carries every domain the demo renders and no more', () => {
    // The bundle's own keys, checked against the slice. A domain added to
    // DEMO_DOMAINS without an implementation is a compile error; this catches
    // the reverse — an implementation mounted that the slice does not name.
    const bundle = createFixtureRepositories();
    const domains = Object.keys(bundle).filter((key) => key !== 'mode').sort();

    expect(domains).toEqual([...DEMO_DOMAINS].sort());
  });

  it('needs no client and no principal to construct', () => {
    // The live factory takes both. This one takes nothing, which is what makes
    // the demo public: there is no connection to configure and no scope to get
    // wrong. If this signature ever grows an argument, the demo has acquired a
    // backend.
    expect(createFixtureRepositories).toHaveLength(0);
  });
});

describe('reads resolve against the anchor, not against literals', () => {
  it('dates everything relative to ctx.asOf', async () => {
    // The rule that keeps the demo from going stale: the same read at two
    // different anchors returns two different dates, a year apart. A fixture
    // with a hardcoded date would return the same string both times.
    const early = testReadContext(new Date('2026-01-01T00:00:00Z'));
    const late = testReadContext(new Date('2027-01-01T00:00:00Z'));
    const repositories = createFixtureRepositories();

    const a = await repositories.research.listItems(early);
    const b = await repositories.research.listItems(late);

    expect(a.items[0].publishedAt).not.toBe(b.items[0].publishedAt);
    expect(a.items[0].publishedAt?.slice(0, 4)).toBe('2026');
    expect(b.items[0].publishedAt?.slice(0, 4)).toBe('2027');
  });

  it('keeps the digest populated whenever it is read', async () => {
    // "Today" is worked out from asOf, so a digest authored in August is still
    // a digest in October. Reading it at an arbitrary anchor must not empty it.
    const repositories = createFixtureRepositories();

    for (const anchor of ['2026-03-05T09:00:00Z', '2029-11-20T09:00:00Z']) {
      const digest = await repositories.research.listTodayDigest(
        testReadContext(new Date(anchor)),
      );
      expect(digest.length).toBeGreaterThan(0);
    }
  });
});

describe('pagination', () => {
  it('holds the contract on the activity feed', async () => {
    const { agentActivity } = createFixtureRepositories();

    await expectPaginationContract(
      (readCtx, opts) => agentActivity.listActivity(readCtx, undefined, opts),
      { total: 3 },
    );
  });

  it('holds the contract on the research feed', async () => {
    const { research } = createFixtureRepositories();

    await expectPaginationContract((readCtx, opts) => research.listItems(readCtx, opts), {
      total: 3,
    });
  });

  it('holds the contract on market reports', async () => {
    const { marketReports } = createFixtureRepositories();

    await expectPaginationContract((readCtx, opts) => marketReports.listReports(readCtx, opts), {
      total: 3,
    });
  });
});

describe('ordering', () => {
  it('returns reports newest first', async () => {
    const { marketReports } = createFixtureRepositories();
    const { items } = await marketReports.listReports(ctx);

    expectDescendingBy(items, 'asOf');
  });

  it('returns the signals feed newest first', async () => {
    const { ecosystem } = createFixtureRepositories();
    const items = await ecosystem.listFeed(ctx);

    expectDescendingBy(items, 'detectedAt');
  });
});

describe('filtering happens in the adapter', () => {
  it('filters activity by status', async () => {
    // Pushed into the adapter, not done by the caller: a page that fetched
    // everything and filtered in the component would work against three
    // fixtures and fall over against the real table.
    const { agentActivity } = createFixtureRepositories();

    const pending = await agentActivity.listActivity(ctx, { status: ['pending'] });

    expect(pending.items).toHaveLength(1);
    expect(pending.total).toBe(1);
    expect(pending.items[0].status).toBe('pending');
  });

  it('counts pending without listing it', async () => {
    const { agentActivity } = createFixtureRepositories();

    expect(await agentActivity.countPending(ctx)).toBe(1);
  });
});

describe('lookups', () => {
  it('rejects a missing article with NotFoundError, naming it', async () => {
    const { research } = createFixtureRepositories();

    await expectNotFound(() => research.getItem(ctx, 'no-such-item'), {
      entity: 'news_item',
      id: 'no-such-item',
    });
  });

  it('resolves a company by slug or by id', async () => {
    const { companies } = createFixtureRepositories();

    const bySlug = await companies.getCompany(ctx, 'placeholder-holdings');
    const byId = await companies.getCompany(ctx, 'co-1');

    expect(bySlug).toEqual(byId);
    expect(await companies.getCompany(ctx, 'nope')).toBeNull();
  });

  it('reports an unclassified change as present rather than gone', async () => {
    // The distinction the promotion gate turns on. Both fixture changes are
    // classified, so what this pins is the other half: a missing change is
    // null, a present one is a gate object.
    const { ecosystem } = createFixtureRepositories();

    expect(await ecosystem.getPromotionGate(ctx, 'ch-2')).toEqual({
      complianceClass: 'general_advice',
    });
    expect(await ecosystem.getPromotionGate(ctx, 'gone')).toBeNull();
  });
});

describe('writes are blocked and say what they would have touched', () => {
  // Naming the real table is the feature — it is what makes the demo read as a
  // real app with its hands tied rather than a mockup with dead buttons. So
  // each case checks the table, not just that something threw.
  const repositories = createFixtureRepositories();

  it('blocks an approval', async () => {
    await expectWriteBlocked(() => repositories.agentActivity.approveActivity('a1', 'approved'), {
      operation: 'approveActivity',
      table: 'agent_activity',
    });
  });

  it('blocks a research status change', async () => {
    await expectWriteBlocked(() => repositories.research.setItemStatus('news-1', 'archived'), {
      operation: 'setItemStatus',
      table: 'news_items',
    });
  });

  it('blocks a promotion, naming the knowledge table rather than the feed', async () => {
    // promoteItem writes to two tables; it names the one the user did not ask
    // about, which is the more informative half of what the action does.
    await expectWriteBlocked(() => repositories.research.promoteItem('news-1'), {
      operation: 'promoteItem',
      table: 'knowledge_items',
    });
  });

  it('blocks a content edit', async () => {
    await expectWriteBlocked(
      () => repositories.content.updateBody('cnt-1', { body: 'edited' }),
      { operation: 'updateBody', table: 'content_items' },
    );
  });

  it('blocks a company delete', async () => {
    await expectWriteBlocked(() => repositories.companies.deleteCompany('co-1'), {
      operation: 'deleteCompany',
      table: 'companies',
    });
  });

  it('blocks flagging a change for clients', async () => {
    await expectWriteBlocked(() => repositories.ecosystem.setClientRelevant('ch-1', true), {
      operation: 'setClientRelevant',
      table: 'ecosystem_changes',
    });
  });

  it('blocks report feedback', async () => {
    await expectWriteBlocked(
      () => repositories.marketReports.addReportFeedback('mr-1', { feedback: 'good' }),
      { operation: 'addReportFeedback', table: 'market_report_feedback' },
    );
  });
});

describe('the surfaces the demo exists to show', () => {
  it('has a quiet day to render', async () => {
    // `quiet-day-path` is one of the two principles the market report surface
    // carries. Without a quiet-day row the annotation points at nothing.
    const { marketReports } = createFixtureRepositories();
    const { items } = await marketReports.listReports(ctx);

    expect(items.some((report) => report.isQuietDay)).toBe(true);
    expect(items.some((report) => !report.isQuietDay)).toBe(true);
  });

  it('has both a promotable and a compliance-sensitive change', async () => {
    // `compliance-as-alignment` needs a change the gate lets through and one it
    // refuses, or the demo can only ever show one side of it.
    const { ecosystem } = createFixtureRepositories();
    const classes = (await ecosystem.listFeed(ctx)).map((change) => change.complianceClass);

    expect(classes).toContain('neutral');
    expect(classes).toContain('general_advice');
  });

  it('has a curator note to point at', async () => {
    // `curator-notes` is the research feed's principle.
    const { research } = createFixtureRepositories();
    const { items } = await research.listItems(ctx);

    expect(items.some((item) => item.curatorNotes !== null)).toBe(true);
  });

  it('has an activity row awaiting approval, with its proposed actions', async () => {
    // `hub-and-spoke`: the approval surface is empty without one.
    const { agentActivity } = createFixtureRepositories();
    const { items } = await agentActivity.listActivity(ctx, { status: ['pending'] });

    expect(items[0].proposedActions.length).toBeGreaterThan(0);
  });

  it('has both a draft and a published item', async () => {
    // `publish-gate` is a contrast; one status cannot show it.
    const { content } = createFixtureRepositories();
    const statuses = (await content.listCards(ctx)).items.map((card) => card.status);

    expect(statuses).toContain('draft');
    expect(statuses).toContain('published');
  });
});
