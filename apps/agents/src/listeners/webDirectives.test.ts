import { describe, it, expect, vi } from 'vitest';

// The listener module bootstraps a Supabase Realtime client and imports the
// Simon agent at top level. Stub both so importing the listener for its pure
// helpers doesn't trigger network or agent setup.
vi.mock('@platform/db', () => ({
  createRealtimeClient: () => ({
    from: () => ({ update: () => ({ eq: () => ({ eq: () => ({}) }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
  }),
}));
vi.mock('../agents/simon/index.js', () => ({ simon: {} }));
vi.mock('./lib/realtimeChannel.js', () => ({ subscribeWithReconnect: () => {} }));

const { analyzeDelegation, needsDelegationRetry, buildFlaggedReply, runDirectiveWithRetry } =
  await import('./webDirectives.js');

const subagentCall = { toolName: 'agent-charlie' };
const dbCall = { toolName: 'supabase_query' };

describe('analyzeDelegation', () => {
  it('reports delegated when a subagent tool was invoked', () => {
    const a = analyzeDelegation({
      text: 'Charlie drafted the newsletter.',
      toolCalls: [subagentCall],
    });
    expect(a.delegated).toBe(true);
  });

  it('flags claimed-but-not-delegated when text claims delegation with no subagent call', () => {
    const a = analyzeDelegation({
      text: "Let me try delegating to him again.",
      toolCalls: [dbCall],
    });
    expect(a.delegated).toBe(false);
    expect(a.claimsDelegation).toBe(true);
    expect(needsDelegationRetry(a)).toBe(true);
  });

  it('does not flag when text claims delegation AND a subagent was invoked', () => {
    const a = analyzeDelegation({
      text: 'I handed this off to Charlie — draft is below.',
      toolCalls: [subagentCall],
    });
    expect(a.claimsDelegation).toBe(true);
    expect(a.delegated).toBe(true);
    expect(needsDelegationRetry(a)).toBe(false);
  });

  it('flags an empty retry promise when Simon promises to retry without a subagent call', () => {
    const a = analyzeDelegation({
      text: "That stalled — let me try again now.",
      toolCalls: [dbCall],
    });
    expect(a.emptyRetryPromise).toBe(true);
    expect(needsDelegationRetry(a)).toBe(true);
  });

  it('detects a silent failure when a subagent errored but Simon claims progress', () => {
    const a = analyzeDelegation({
      text: "Done — Charlie's working on it and will have it ready shortly.",
      toolCalls: [subagentCall],
      toolResults: [{ toolName: 'agent-charlie', isError: true, result: 'boom' }],
    });
    expect(a.silentFailure).toBe(true);
    expect(a.failedDelegate?.toolName).toBe('agent-charlie');
  });

  it('does not flag a failure Simon openly acknowledges', () => {
    const a = analyzeDelegation({
      text: "Charlie timed out — sorry. Resend and I'll try again.",
      toolCalls: [subagentCall],
      toolResults: [{ toolName: 'agent-charlie', isError: true, result: 'timeout' }],
    });
    expect(a.silentFailure).toBe(false);
  });

  it('treats a clean answer with no delegation claim as fine', () => {
    const a = analyzeDelegation({ text: 'Your next meeting is at 3pm.', toolCalls: [dbCall] });
    expect(needsDelegationRetry(a)).toBe(false);
    expect(a.silentFailure).toBe(false);
  });
});

describe('buildFlaggedReply', () => {
  it('appends the named-but-not-invoked note', () => {
    const result = { text: 'Let me delegate that to Charlie.', toolCalls: [dbCall] };
    const reply = buildFlaggedReply(result, analyzeDelegation(result));
    expect(reply).toContain('Let me delegate that to Charlie.');
    expect(reply).toContain("[system: I named a specialist but didn't actually invoke one");
  });

  it('appends the actual error string on a silent failure', () => {
    const result = {
      text: "All set — Charlie's on it.",
      toolCalls: [subagentCall],
      toolResults: [{ toolName: 'agent-charlie', isError: true, result: { error: 'rate limited' } }],
    };
    const reply = buildFlaggedReply(result, analyzeDelegation(result));
    expect(reply).toContain('agent-charlie actually returned an error: rate limited');
  });

  it('appends the empty-retry note', () => {
    const result = { text: "Let me try again now.", toolCalls: [] };
    const reply = buildFlaggedReply(result, analyzeDelegation(result));
    expect(reply).toContain("[system: Simon promised a retry but didn't actually run one.");
  });

  it('returns the text unchanged on a clean delegation', () => {
    const result = { text: 'Charlie drafted it, excerpt below.', toolCalls: [subagentCall] };
    expect(buildFlaggedReply(result, analyzeDelegation(result))).toBe(result.text);
  });
});

describe('runDirectiveWithRetry', () => {
  const ctx = { resource: 'web-director', thread: 'thread-1', signal: new AbortController().signal };

  it('does not retry when the first attempt actually delegates', async () => {
    const generate = vi.fn(async () => ({
      text: 'Charlie drafted the newsletter.',
      toolCalls: [subagentCall],
    }));
    const { retried, analysis } = await runDirectiveWithRetry(generate, 'draft a newsletter', ctx);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(retried).toBe(false);
    expect(analysis.delegated).toBe(true);
  });

  it('retries once with a non-persisted system nudge and uses the retry result', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ text: 'Let me try delegating to Charlie again.', toolCalls: [dbCall] })
      .mockResolvedValueOnce({ text: 'Charlie drafted the newsletter.', toolCalls: [subagentCall] });

    const { result, analysis, retried } = await runDirectiveWithRetry(
      generate,
      'draft a newsletter',
      ctx,
    );

    expect(generate).toHaveBeenCalledTimes(2);
    expect(retried).toBe(true);
    expect(analysis.delegated).toBe(true);
    expect(result.text).toBe('Charlie drafted the newsletter.');

    // The retry must carry a system-role context nudge, and the first call must not.
    const firstOpts = generate.mock.calls[0][1];
    const secondOpts = generate.mock.calls[1][1];
    expect(firstOpts.context).toBeUndefined();
    expect(secondOpts.context).toHaveLength(1);
    expect(secondOpts.context[0].role).toBe('system');
    expect(secondOpts.context[0].content).toMatch(/invoke the correct subagent tool now/i);
  });

  it('retries once and still flags if the retry also fails to delegate', async () => {
    const generate = vi.fn(async () => ({
      text: 'Let me try delegating to Charlie again.',
      toolCalls: [dbCall],
    }));
    const { analysis, retried } = await runDirectiveWithRetry(generate, 'draft a newsletter', ctx);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(retried).toBe(true);
    expect(needsDelegationRetry(analysis)).toBe(true);
    expect(buildFlaggedReply({ text: 'Let me try delegating to Charlie again.', toolCalls: [dbCall] }, analysis)).toContain(
      "[system: I named a specialist but didn't actually invoke one",
    );
  });
});
