import { describe, expect, it } from 'vitest';
import { COMPANIES, CONTACTS, SOURCES, WATCHED } from './entities';
import { agentActivity } from './agent-activity';
import { companies, companyContacts } from './companies';
import { contentCards, contentDetails, publishGates } from './content-items';
import { ecosystemChanges, watchHealth } from './ecosystem-changes';
import { indicators } from './indicators';
import { marketReports } from './market-reports';
import { newsFeed, newsItems } from './research-items';

/**
 * The compliance and consistency rules, as tests.
 *
 * This set goes on a public URL under BTS branding, published by a business
 * operating as an Authorised Representative. The rules it is written under are
 * documented in three places and would otherwise be held only by whoever last
 * read them — which is not a control, it is a hope. What can be checked
 * mechanically is checked here.
 *
 * What these tests **cannot** do, and which still has to happen before this
 * deploys:
 *
 * - **The ASIC search.** No test can tell whether an invented company name
 *   resolves to a real business. Every name in `entities.ts` needs searching.
 * - **The Lex pass.** Prose that reads as advice is a judgement, not a pattern.
 *   The spec requires a classification pass over the full set with the outcome
 *   recorded in `agent_activity` on the live platform.
 *
 * A green suite here means the mechanical rules hold. It does not mean the set
 * has been cleared.
 */
const anchor = new Date('2026-06-15T00:00:00Z');

/** Every string the fixture set puts on a screen. */
function allProse(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const add = (where: string, text: string | null | undefined) => {
    if (typeof text === 'string' && text.length > 0) out.push({ where, text });
  };

  for (const report of marketReports(anchor)) {
    add(`market-report ${report.id}`, report.narrationMarkdown);
    for (const entry of report.priorFeedback) add(`market-report ${report.id} feedback`, entry.feedback);
    for (const finding of report.findings) {
      add(`finding ${finding.id}`, finding.narration_hint.means);
      add(`finding ${finding.id}`, finding.narration_hint.noise_note);
    }
  }
  for (const item of newsItems(anchor)) {
    add(`news ${item.id}`, item.title);
    add(`news ${item.id}`, item.summary);
    add(`news ${item.id}`, item.curatorNotes);
    add(`news ${item.id}`, item.bodyMarkdown);
  }
  for (const detail of contentDetails(anchor)) {
    add(`content ${detail.id}`, detail.title);
    add(`content ${detail.id}`, detail.body);
    for (const entry of detail.priorFeedback) add(`content ${detail.id} feedback`, entry.feedback);
  }
  for (const row of agentActivity(anchor)) {
    add(`activity ${row.id}`, row.action);
    add(`activity ${row.id}`, row.approvedResponse);
    for (const action of row.proposedActions) add(`activity ${row.id} proposal`, action.label);
  }
  for (const change of ecosystemChanges(anchor)) {
    add(`change ${change.id}`, change.title);
    add(`change ${change.id}`, change.summary);
    add(`change ${change.id}`, change.curatorNote);
  }
  for (const company of companies(anchor)) add(`company ${company.id}`, company.notes);

  return out;
}

describe('no bitcoin allocation figures', () => {
  it('states no percentage, target or amount of bitcoin anywhere', () => {
    // The single highest-risk element of the whole build. An allocation figure
    // on a public URL under BTS branding is the thing that turns a portfolio
    // demo into a compliance problem, and it does not become safe by being
    // labelled illustrative.
    const patterns = [
      /\d+\s?%\s*(of\s+)?(the\s+)?(treasury|balance sheet|reserves?|cash|portfolio|holdings?)/i,
      /(allocate|allocation|invest|hold)\w*\s+\d+(\.\d+)?\s?%/i,
      /\d+(\.\d+)?\s?%\s+(allocation|in bitcoin|to bitcoin)/i,
      /\d+(\.\d+)?\s?(btc|bitcoin)\b/i,
      /(target|recommend\w*)\s+(an?\s+)?allocation/i,
    ];

    for (const { where, text } of allProse()) {
      for (const pattern of patterns) {
        expect(`${where}: ${text}`).not.toMatch(pattern);
      }
    }
  });

  it('shows no bitcoin price on the indicator dashboard', () => {
    // A price invites exactly the reading the neutral-delta rule exists to
    // prevent, and nothing on this surface needs one.
    const keys = indicators(anchor).onchainLatest.map((row) => row.key);
    for (const key of keys) {
      expect(key).not.toMatch(/price|usd|aud.*btc|btc.*aud/i);
    }
  });
});

describe('banned terminology', () => {
  it('uses none of it', () => {
    // docs/brand-voice.md § Banned Terminology. These are the words that make
    // BTS sound like the thing it spent its brand voice distinguishing itself
    // from.
    const banned = [
      'to the moon', 'moonshot', 'explosive growth', 'skyrocket', 'bull run',
      'FOMO', 'HODL', 'diamond hands', 'laser eyes',
      'guaranteed return', 'risk-free', 'sure thing', 'easy money', 'get rich quick',
      'revolutionary', 'game-changer', 'disruptive',
      'speculative investment', 'bet on Bitcoin', 'shitcoin',
      'crypto', 'cryptocurrency',
      'limited time', 'act now', "don't miss out", 'urgent opportunity',
      'investment strategy',
    ];

    for (const { where, text } of allProse()) {
      for (const word of banned) {
        expect(`${where}: ${text.toLowerCase()}`).not.toContain(word.toLowerCase());
      }
    }
  });

  it('uses no exclamation marks', () => {
    // Never in UI copy. Ever.
    for (const { where, text } of allProse()) {
      expect(`${where}: ${text}`).not.toMatch(/!/);
    }
  });

  it('uses no emoji', () => {
    for (const { where, text } of allProse()) {
      expect(`${where}: ${text}`).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe('fictional entities', () => {
  it('routes every email through example.com', () => {
    // Never a live third-party domain: a fixture address on a real domain is
    // someone's real inbox.
    for (const contacts of Object.values(companyContacts())) {
      for (const contact of contacts) {
        expect(contact.email).toMatch(/@example\.com$/);
      }
    }
  });

  it('points every link at an example domain', () => {
    const urls = [
      ...newsFeed(anchor).map((item) => item.url),
      ...ecosystemChanges(anchor).map((change) => change.externalUrl),
      ...companies(anchor).map((company) => company.website),
    ].filter((url): url is string => url !== null);

    for (const url of urls) {
      // `email://` is the app's own synthetic scheme for newsletter-sourced
      // items; everything with a host must be an example one.
      if (url.startsWith('email://')) continue;
      expect(url).toMatch(/^https:\/\/[\w.-]+\.example\.com(\/|$)/);
    }
  });

  it('names no real institution as the source of an invented statement', () => {
    // The rule that is easy to get backwards. Naming a real regulator is not
    // the risk; attributing an invented headline or summary to one is, because
    // that is a fabricated record of an institution that exists.
    const institutions = [
      'ASIC', 'APRA', 'ATO', 'RBA', 'AUSTRAC', 'ASX',
      'SEC', 'Fidelity', 'BlackRock', 'ARK', 'Coinbase', 'MicroStrategy',
    ];

    for (const { where, text } of allProse()) {
      for (const name of institutions) {
        expect(`${where}: ${text}`).not.toMatch(new RegExp(`\\b${name}\\b`));
      }
    }
  });

  it('draws every entity name from entities.ts', () => {
    // Internal consistency is a stated requirement — a set naming different
    // companies in different files reads as sloppy and undermines the whole
    // impression. Sourcing them from one module makes that structural; this
    // checks the module is actually the source.
    const known = [
      ...Object.values(COMPANIES).map((c) => c.name),
      ...Object.values(CONTACTS).map((c) => `${c.firstName} ${c.lastName}`),
      ...Object.values(CONTACTS).map((c) => c.firstName),
      ...Object.values(SOURCES),
      ...Object.values(WATCHED).map((w) => w.name),
    ];

    expect(companies(anchor).map((c) => c.name).every((name) => known.includes(name))).toBe(true);
    expect(newsFeed(anchor).every((item) => known.includes(item.sourceName))).toBe(true);
    expect(
      ecosystemChanges(anchor).every((change) => known.includes(change.entityName ?? '')),
    ).toBe(true);
    expect(watchHealth(anchor).every((watch) => known.includes(watch.entityName ?? ''))).toBe(true);
  });
});

describe('relative dating', () => {
  it('carries no absolute date in any fixture string', () => {
    // A date typed into prose does not move with the anchor, and the demo goes
    // stale the moment it disagrees with the rows around it.
    for (const { where, text } of allProse()) {
      expect(`${where}: ${text}`).not.toMatch(/\b(19|20)\d{2}-\d{2}-\d{2}\b/);
      expect(`${where}: ${text}`).not.toMatch(
        /\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/i,
      );
    }
  });

  it('moves every generated date with the anchor', () => {
    const early = marketReports(new Date('2026-06-15T00:00:00Z'));
    const late = marketReports(new Date('2028-02-02T00:00:00Z'));

    expect(early[0].asOf).not.toBe(late[0].asOf);
    expect(late[0].asOf.startsWith('2028')).toBe(true);
  });
});

describe('the staging table, as assertions', () => {
  // Each case names the architectural claim its row exists to make. If a
  // fixture is edited into blandness these fail, which is the point: the most
  // common way a demo like this fails is that the data stops being interesting
  // and nothing notices.

  it('has a quiet day that scored a finding and still said nothing', () => {
    // "We looked and found nothing worth telling you" is a different claim from
    // "we did not look", and the finding under the floor is what distinguishes
    // them.
    const quiet = marketReports(anchor).find((report) => report.isQuietDay);

    expect(quiet).toBeDefined();
    expect(quiet?.narrationMarkdown).toBeNull();
    expect(quiet?.findings.length).toBeGreaterThan(0);
    expect(quiet?.findings.every((finding) => finding.materiality < 0.2)).toBe(true);
  });

  it('has a narrated day whose findings all cleared the floor', () => {
    const normal = marketReports(anchor).find((report) => report.id === 'mr-normal');

    expect(normal?.narrationMarkdown).toBeTruthy();
    expect(normal?.findings.length).toBeGreaterThanOrEqual(4);
    expect(normal?.findings.every((finding) => finding.materiality > 0.2)).toBe(true);
  });

  it('has a finding the narrator may report but may not conclude from', () => {
    // `verdict_allowed: false` is the constraint that most distinguishes this
    // pipeline from one that just summarises. The narration has to visibly
    // respect it.
    const normal = marketReports(anchor).find((report) => report.id === 'mr-normal');
    const guarded = normal?.findings.filter((finding) => !finding.narration_hint.verdict_allowed);

    expect(guarded?.length).toBeGreaterThan(0);
    expect(normal?.narrationMarkdown).toMatch(/not a trend|does not attribute/i);
  });

  it('has a held report — the pipeline has a refusal path', () => {
    expect(marketReports(anchor).some((report) => report.status === 'held')).toBe(true);
  });

  it('has a curator note that adds what the score could not', () => {
    const annotated = newsFeed(anchor).filter((item) => item.curatorNotes !== null);
    expect(annotated.length).toBeGreaterThan(0);
    // And a high-scoring item without one, so "curated" does not read as a
    // synonym for "relevant".
    expect(
      newsFeed(anchor).some((item) => (item.relevanceScore ?? 0) > 0.8 && item.curatorNotes === null),
    ).toBe(true);
  });

  it('has an item the scorer rejected', () => {
    // A scorer that only ever approves is not a scorer.
    expect(newsFeed(anchor).some((item) => (item.relevanceScore ?? 1) < 0.2)).toBe(true);
  });

  it('has an item that arrived by email rather than by feed', () => {
    expect(newsFeed(anchor).some((item) => item.url.startsWith('email://'))).toBe(true);
  });

  it('has a draft, a published item, and one held by a compliance verdict', () => {
    const statuses = contentCards(anchor).map((card) => card.status);
    expect(statuses).toContain('draft');
    expect(statuses).toContain('published');

    const flagged = publishGates(anchor)['cnt-flagged'];
    expect(flagged.complianceStatus).toBe('flagged');
    // With a stated reason. A verdict with no rationale is a checkbox.
    const detail = contentDetails(anchor).find((row) => row.id === 'cnt-flagged');
    expect(detail?.priorFeedback[0]?.feedback).toBeTruthy();
  });

  it('has a scheduled run that found nothing and logged anyway', () => {
    const quiet = agentActivity(anchor).find(
      (row) => row.triggerType === 'schedule' && row.status === 'auto',
    );

    expect(quiet).toBeDefined();
    expect(quiet?.proposedActions).toHaveLength(0);
  });

  it('has a run stopped at the approval wall, with what it proposed', () => {
    const pending = agentActivity(anchor).find((row) => row.status === 'pending');

    expect(pending?.proposedActions.length).toBeGreaterThanOrEqual(3);
  });

  it('has a rejected run, so approval is visibly a decision', () => {
    const rejected = agentActivity(anchor).find((row) => row.status === 'rejected');

    expect(rejected).toBeDefined();
    expect(rejected?.approvedResponse).toBeTruthy();
  });

  it('has a promotable change, a refused one, and an unclassified one', () => {
    const classes = ecosystemChanges(anchor).map((change) => change.complianceClass);

    expect(classes).toContain('neutral');
    expect(classes).toContain('general_advice');
    // The third state. The gate fails closed on it, and without a row here
    // that behaviour is untestable from the UI.
    expect(classes).toContain(null);
  });

  it('has indicator deltas of both signs and a zero', () => {
    // Neutral delta colour cannot be demonstrated by a dashboard that only
    // moved one way — that just happens not to break the rule.
    const deltas = [
      ...indicators(anchor).macroLatest.map((row) => row.changeSincePrior),
      ...indicators(anchor).onchainLatest.map((row) => row.changeSincePrior),
    ].filter((delta): delta is number => delta !== null);

    expect(deltas.some((delta) => delta > 0)).toBe(true);
    expect(deltas.some((delta) => delta < 0)).toBe(true);
    expect(deltas.some((delta) => delta === 0)).toBe(true);
  });

  it('has a stalled company, which is where a findings pack would point', () => {
    expect(companies(anchor).some((company) => company.notes?.includes('Nothing since'))).toBe(true);
  });

  it('has a company with no contacts, so the empty state is reachable', () => {
    expect(Object.values(companyContacts()).some((contacts) => contacts.length === 0)).toBe(true);
  });
});
