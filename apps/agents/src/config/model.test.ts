import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { createFakeSupabase } from '../../test/mocks/supabase.js';

// Anthropic factory returns a fn(modelId) → languageModel; capture the modelId
// it's called with so we can assert which model was resolved.
const anthropicFactory = vi.fn((id: string) => ({ provider: 'anthropic', id }));
const createAnthropic = vi.fn(() => anthropicFactory);

// OpenAI factory returns an object with .chat(modelId)
const openaiChat = vi.fn((id: string) => ({ provider: 'openai', id }));
const createOpenAI = vi.fn(() => ({ chat: openaiChat }));

vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI }));

const fake = createFakeSupabase();
vi.mock('@platform/db', () => ({ get supabase() { return fake; } }));

async function loadFresh() {
  vi.resetModules();
  return await import('./model.js');
}

describe('buildModel via getModelConfig', () => {
  beforeEach(() => {
    anthropicFactory.mockClear();
    openaiChat.mockClear();
    createAnthropic.mockClear();
    createOpenAI.mockClear();
    vi.unstubAllEnvs();
    vi.stubEnv('OPENROUTER_API_KEY', '');
  });

  it('uses Anthropic when only ANTHROPIC_API_KEY is set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('ANTHROPIC_MODEL', 'anthropic/claude-sonnet-4-5');
    const { getModelConfig } = await loadFresh();
    const model = getModelConfig();
    expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'sk-ant-test' });
    // The `anthropic/` prefix is stripped before being passed to the SDK.
    expect(anthropicFactory).toHaveBeenCalledWith('claude-sonnet-4-5');
    expect(model).toMatchObject({ provider: 'anthropic', id: 'claude-sonnet-4-5' });
  });

  it('uses OpenRouter (via openai.chat) when OPENROUTER_API_KEY is set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
    vi.stubEnv('OPENROUTER_MODEL', 'anthropic/claude-sonnet-4-5');
    const { getModelConfig } = await loadFresh();
    const model = getModelConfig();
    expect(createOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-or-test',
      baseURL: 'https://openrouter.ai/api/v1',
    });
    // OpenRouter accepts the full provider-prefixed id verbatim.
    expect(openaiChat).toHaveBeenCalledWith('anthropic/claude-sonnet-4-5');
    expect(model).toMatchObject({ provider: 'openai', id: 'anthropic/claude-sonnet-4-5' });
  });

  it('throws when no provider key is set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const { getModelConfig } = await loadFresh();
    expect(() => getModelConfig()).toThrow(/No AI provider configured/);
  });
});

describe('stepRequestContext', () => {
  it('returns a RequestContext carrying the step scope key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    const { stepRequestContext } = await loadFresh();
    const ctx = stepRequestContext('recorder.identify_speakers');
    expect(ctx).toBeInstanceOf(RequestContext);
    expect(ctx.get('stepScope')).toBe('recorder.identify_speakers');
  });
});

describe('dynamicModelFor', () => {
  beforeEach(() => {
    anthropicFactory.mockClear();
    openaiChat.mockClear();
    fake.__builders.length = 0;
    fake.__responses.clear();
    fake.from.mockClear();
    vi.unstubAllEnvs();
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    vi.stubEnv('OPENROUTER_API_KEY', '');
  });

  it('falls through to env default when no override exists for the agent scope', async () => {
    vi.stubEnv('ANTHROPIC_MODEL', 'anthropic/claude-default');
    fake.__setResponse('model_configs', { data: [], error: null });

    const { dynamicModelFor } = await loadFresh();
    const requestContext = new RequestContext();
    await dynamicModelFor('charlie')({ requestContext });

    expect(anthropicFactory).toHaveBeenCalledWith('claude-default');
  });

  it('uses the agent-scope override when present in model_configs', async () => {
    fake.__setResponse('model_configs', {
      data: [{ scope_key: 'charlie', model_id: 'anthropic/claude-charlie-override' }],
      error: null,
    });
    const { dynamicModelFor } = await loadFresh();
    await dynamicModelFor('charlie')({ requestContext: new RequestContext() });
    expect(anthropicFactory).toHaveBeenCalledWith('claude-charlie-override');
  });

  it('prefers a step-scope override when stepRequestContext is set', async () => {
    fake.__setResponse('model_configs', {
      data: [
        { scope_key: 'roger', model_id: 'anthropic/claude-roger' },
        { scope_key: 'recorder.identify_speakers', model_id: 'anthropic/claude-step' },
      ],
      error: null,
    });
    const { dynamicModelFor, stepRequestContext } = await loadFresh();
    await dynamicModelFor('roger')({
      requestContext: stepRequestContext('recorder.identify_speakers'),
    });
    expect(anthropicFactory).toHaveBeenCalledWith('claude-step');
  });

  it('falls back to the step\'s fallbackAgent then the owning agent then env default', async () => {
    vi.stubEnv('ANTHROPIC_MODEL', 'anthropic/claude-default');
    fake.__setResponse('model_configs', {
      data: [{ scope_key: 'roger', model_id: 'anthropic/claude-roger' }],
      error: null,
    });
    const { dynamicModelFor, stepRequestContext } = await loadFresh();
    // No row for recorder.identify_speakers → fallback to roger (its
    // declared fallbackAgent in MODEL_SCOPES) → row exists for roger.
    // Note: dynamicModelFor is called for `charlie` (a different owning
    // agent) to prove the step's fallbackAgent wins over the owning agent.
    await dynamicModelFor('charlie')({
      requestContext: stepRequestContext('recorder.identify_speakers'),
    });
    expect(anthropicFactory).toHaveBeenCalledWith('claude-roger');
  });
});
