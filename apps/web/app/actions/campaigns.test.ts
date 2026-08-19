import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFakeRepositories,
  fakeCampaignGate,
  type FakeRepositories,
} from '@/test/mocks/repositories';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

// New with vertical 4.3c. These eight actions had no test at all — 453 lines of
// guarded writes, most of them handing a decision to the agents server through
// a JSONB column. Converting them to the seam is the moment that becomes
// testable without describing a query-builder chain, so this covers the halves
// that stayed in the app: the validation and the refusals.
let repositories: FakeRepositories;
let authed: boolean;

vi.mock('@/lib/action', () => ({
  getAuthedRepositories: vi.fn(async () =>
    authed
      ? { ok: true, repositories, user: { id: 'director-1' } }
      : { ok: false, error: 'You need to be signed in to do that.' },
  ),
}));

import {
  submitVariantGateDecision,
  createCampaignDraft,
  launchCampaignStrategy,
  submitCampaignGateDecision,
  markVariantPosted,
  editVariantCopy,
  savePostMetrics,
  promotePostToSnippet,
} from './campaigns';

const cadence = {
  accountIds: ['11111111-1111-4111-8111-111111111111'],
  postsPerWeek: 3,
  slots: [{ day: 'MO', time: '09:00' }],
  durationWeeks: 6,
  startDate: '2026-09-01',
};

beforeEach(() => {
  repositories = createFakeRepositories();
  authed = true;
  revalidatePath.mockClear();
});

describe('submitVariantGateDecision', () => {
  it('hands an approval to the agents server', async () => {
    expect(await submitVariantGateDecision('ci-1', { decision: 'approve' })).toEqual({
      success: true,
    });
    expect(repositories.campaigns.setVariantDecision).toHaveBeenCalledWith('ci-1', {
      decision: 'approve',
    });
  });

  it('will not request a change without saying what to change', async () => {
    expect(await submitVariantGateDecision('ci-1', { decision: 'request_change' })).toEqual({
      error: 'Tell Charlie what to change before requesting a revision.',
    });
    expect(repositories.campaigns.setVariantDecision).not.toHaveBeenCalled();
  });

  it('rejects a decision it does not recognise', async () => {
    const result = await submitVariantGateDecision('ci-1', { decision: 'maybe' });

    expect(result).toHaveProperty('error');
    expect(repositories.campaigns.setVariantDecision).not.toHaveBeenCalled();
  });
});

describe('createCampaignDraft', () => {
  it('returns the id the wizard advances with', async () => {
    expect(
      await createCampaignDraft({
        name: 'Q3 treasury series',
        objective: 'Educate CFOs',
        audienceFilter: { industry: [], pipeline_stage: [] },
      }),
    ).toEqual({ id: 'camp-new' });
  });

  it('refuses an unnamed campaign in its own words', async () => {
    expect(
      await createCampaignDraft({ name: '  ', objective: 'x', audienceFilter: {} }),
    ).toEqual({ error: 'Give the campaign a name.' });
  });
});

describe('launchCampaignStrategy', () => {
  it('saves the cadence and launches', async () => {
    expect(await launchCampaignStrategy('camp-1', cadence)).toEqual({ success: true });
    expect(repositories.campaigns.saveCadenceAndLaunch).toHaveBeenCalledWith('camp-1', cadence);
  });

  it('says so when the campaign is gone', async () => {
    repositories = createFakeRepositories({ campaignGate: null });

    expect(await launchCampaignStrategy('camp-1', cadence)).toEqual({
      error: 'Campaign not found.',
    });
  });

  it('refuses to relaunch a campaign that has already started', async () => {
    // The cadence lock: a re-run must not relaunch a campaign mid-flight.
    repositories = createFakeRepositories({
      campaignGate: fakeCampaignGate({ status: 'strategy_approved' }),
    });

    expect(await launchCampaignStrategy('camp-1', cadence)).toEqual({
      error: 'This campaign has already started — cadence is locked.',
    });
    expect(repositories.campaigns.saveCadenceAndLaunch).not.toHaveBeenCalled();
  });

  it('insists on at least one account and one slot', async () => {
    expect(await launchCampaignStrategy('camp-1', { ...cadence, accountIds: [] })).toEqual({
      error: 'Pick at least one account.',
    });
    expect(await launchCampaignStrategy('camp-1', { ...cadence, slots: [] })).toEqual({
      error: 'Add at least one posting slot.',
    });
  });
});

describe('submitCampaignGateDecision', () => {
  const approve = { decision: 'approve' as const };

  it('writes a decision for a campaign with an open gate', async () => {
    expect(await submitCampaignGateDecision('camp-1', approve)).toEqual({ success: true });
    expect(repositories.campaigns.setCampaignDecision).toHaveBeenCalledWith('camp-1', approve);
  });

  it('refuses when no run is in flight', async () => {
    repositories = createFakeRepositories({
      campaignGate: fakeCampaignGate({ workflowRunId: null }),
    });

    expect(await submitCampaignGateDecision('camp-1', approve)).toEqual({
      error: 'No review is open for this campaign right now.',
    });
  });

  it('refuses when a run is in flight but no gate is open', async () => {
    repositories = createFakeRepositories({ campaignGate: fakeCampaignGate({ openGate: null }) });

    expect(await submitCampaignGateDecision('camp-1', approve)).toEqual({
      error: 'No review is open for this campaign right now.',
    });
  });

  it('refuses once the plan is approved — the strategy lock', async () => {
    repositories = createFakeRepositories({
      campaignGate: fakeCampaignGate({ status: 'plan_approved' }),
    });

    expect(await submitCampaignGateDecision('camp-1', approve)).toEqual({
      error: 'This campaign is locked — its plan has been approved.',
    });
    expect(repositories.campaigns.setCampaignDecision).not.toHaveBeenCalled();
  });

  it('accepts a gate 2 decision on a strategy-approved campaign', async () => {
    repositories = createFakeRepositories({
      campaignGate: fakeCampaignGate({ status: 'strategy_approved', openGate: 'plan' }),
    });

    expect(await submitCampaignGateDecision('camp-1', approve)).toEqual({ success: true });
  });

  it('requires an instruction with a change request', async () => {
    const result = await submitCampaignGateDecision('camp-1', { decision: 'request_change' });

    expect(result).toHaveProperty('error');
    expect(repositories.campaigns.setCampaignDecision).not.toHaveBeenCalled();
  });
});

describe('markVariantPosted', () => {
  it('records the live URL', async () => {
    expect(
      await markVariantPosted('ci-1', 'camp-1', { url: 'https://li.test/posts/1' }),
    ).toEqual({ success: true });
    expect(repositories.campaigns.markVariantPosted).toHaveBeenCalledWith(
      'ci-1',
      'https://li.test/posts/1',
    );
  });

  it('says the queue is stale when the row had already moved on', async () => {
    repositories.campaigns.markVariantPosted.mockResolvedValueOnce(false);

    expect(
      await markVariantPosted('ci-1', 'camp-1', { url: 'https://li.test/posts/1' }),
    ).toEqual({ error: 'This variant is no longer ready to post — refresh the queue.' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses anything that is not a URL', async () => {
    expect(await markVariantPosted('ci-1', 'camp-1', { url: 'not a url' })).toEqual({
      error: 'Paste the live post URL.',
    });
  });
});

describe('editVariantCopy', () => {
  it('saves a single post', async () => {
    expect(
      await editVariantCopy('ci-1', { isThread: false, body: 'Edited.', segments: [] }),
    ).toEqual({ success: true });
    expect(repositories.campaigns.saveVariantCopy).toHaveBeenCalledWith('ci-1', {
      isThread: false,
      body: 'Edited.',
      segments: [],
    });
  });

  it('refuses an empty post and an empty thread', async () => {
    expect(
      await editVariantCopy('ci-1', { isThread: false, body: '   ', segments: [] }),
    ).toEqual({ error: 'The post body cannot be empty.' });

    expect(await editVariantCopy('ci-1', { isThread: true, body: '', segments: [] })).toEqual({
      error: 'A thread needs at least one segment.',
    });
    expect(repositories.campaigns.saveVariantCopy).not.toHaveBeenCalled();
  });

  it('says so when the variant is gone', async () => {
    repositories.campaigns.saveVariantCopy.mockResolvedValueOnce(false);

    expect(
      await editVariantCopy('ci-1', { isThread: false, body: 'Edited.', segments: [] }),
    ).toEqual({ error: 'Variant not found.' });
  });
});

describe('savePostMetrics', () => {
  it('normalises absent counts to null rather than dropping them', async () => {
    expect(
      await savePostMetrics('ci-1', 'camp-1', 'linkedin', { impressions: 1200 }),
    ).toEqual({ success: true });

    expect(repositories.campaigns.savePostMetrics).toHaveBeenCalledWith('ci-1', 'linkedin', {
      impressions: 1200,
      reactions: null,
      comments: null,
      reposts: null,
      clicks: null,
    });
  });

  it('refuses a negative count', async () => {
    const result = await savePostMetrics('ci-1', 'camp-1', 'linkedin', { impressions: -1 });

    expect(result).toHaveProperty('error');
    expect(repositories.campaigns.savePostMetrics).not.toHaveBeenCalled();
  });
});

describe('promotePostToSnippet', () => {
  it('promotes with the curator note', async () => {
    expect(
      await promotePostToSnippet('ci-1', 'camp-1', {
        body: 'A strong opener.',
        curator_note: 'Shows the plain register.',
        snippet_type: 'opener',
        topic_tags: ['custody'],
      }),
    ).toEqual({ success: true });

    expect(repositories.campaigns.promoteToVoiceSnippet).toHaveBeenCalledWith('ci-1', {
      body: 'A strong opener.',
      curatorNote: 'Shows the plain register.',
      snippetType: 'opener',
      topicTags: ['custody'],
    });
  });

  it('insists on a note explaining why the post demonstrates the voice', async () => {
    // The note is the point — a snippet library with no rationale teaches an
    // agent nothing.
    expect(
      await promotePostToSnippet('ci-1', 'camp-1', { body: 'A post.', curator_note: '  ' }),
    ).toEqual({ error: 'Add a note on why this post demonstrates the voice.' });
  });
});

describe('when signed out', () => {
  it('every action returns the auth error and writes nothing', async () => {
    authed = false;

    expect(await submitVariantGateDecision('ci-1', { decision: 'approve' })).toEqual({
      error: 'You need to be signed in to do that.',
    });
    expect(await launchCampaignStrategy('camp-1', cadence)).toEqual({
      error: 'You need to be signed in to do that.',
    });
    expect(await markVariantPosted('ci-1', 'camp-1', { url: 'https://li.test/p' })).toEqual({
      error: 'You need to be signed in to do that.',
    });

    expect(repositories.campaigns.setVariantDecision).not.toHaveBeenCalled();
    expect(repositories.campaigns.saveCadenceAndLaunch).not.toHaveBeenCalled();
    expect(repositories.campaigns.markVariantPosted).not.toHaveBeenCalled();
  });
});
