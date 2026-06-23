import type { StrategyContext, StrategyObject } from './schemas.js';

// Pure prompt builders + formatters for the Campaign Strategy workflow. Kept
// separate from index.ts so they can be unit-tested without invoking Margot or
// the database.

const NO_TOOL_INSTRUCTION =
  'Return ONLY the structured object. Do not call any tool (no supabase tools, no log_activity) — persistence happens later in the workflow.';

/** Render a loose audience_filter JSONB as a one-line summary for the prompt. */
function formatAudienceFilter(filter: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(filter)) {
    if (value == null) continue;
    const rendered = Array.isArray(value)
      ? value.filter((x) => x != null).join(', ')
      : String(value);
    if (rendered) parts.push(`${key.replace(/_/g, ' ')}: ${rendered}`);
  }
  return parts.join('; ');
}

/** A shared header naming the campaign, objective, audience, and voice — read by
 *  both the strategy and beat-plan prompts so Margot keeps the same grounding. */
function contextHeader(ctx: StrategyContext): string {
  const audience = formatAudienceFilter(ctx.audienceFilter);
  return `## Campaign
Name: ${ctx.name}
Objective: ${ctx.objective}
${audience ? `Audience filter: ${audience}` : ''}
${ctx.audiencePersona ? `Audience persona: ${ctx.audiencePersona}` : ''}

## Company brand voice (the umbrella every BTS message answers to)
${ctx.voiceBlock ?? '(brand voice not available — rely on the BTS stance: plain, credible, calm; capital-B Bitcoin = network, lowercase b = unit; no hype.)'}

${ctx.priorLearnings ? `## Prior-campaign learnings\n${ctx.priorLearnings}` : ''}

${ctx.researchBrief ? `## Research brief (Rex)\n${ctx.researchBrief}` : ''}

${ctx.audienceAnalysis ? `## Audience analysis (Bruno)\n${ctx.audienceAnalysis}` : ''}`;
}

// ── Optional branches (Step 10) ───────────────────────────────────────────────

const RESEARCH_SIGNALS = [
  'trend',
  'trends',
  'competitor',
  'competitors',
  'current',
  'latest',
  'recent',
  'news',
  'market',
  'announcement',
  'regulation',
  'regulatory',
  'this year',
  'this quarter',
  'right now',
  'today',
];

/** Whether the objective warrants a Rex research branch — it references current
 *  events, competitors, or trends. Pure (keyword heuristic) so it's testable and
 *  free; no LLM gate. A year reference (2024+) also trips it. */
export function shouldRunResearch(objective: string): boolean {
  const text = objective.toLowerCase();
  if (RESEARCH_SIGNALS.some((s) => text.includes(s))) return true;
  return /\b20(2[4-9]|[3-9]\d)\b/.test(text);
}

/** Whether to run Bruno's audience-analysis branch — the audience_filter names a
 *  real CRM segment (an industry or pipeline stage) worth characterising. Pure. */
export function shouldRunAudienceAnalysis(filter: Record<string, unknown>): boolean {
  const nonEmpty = (v: unknown): boolean =>
    Array.isArray(v) ? v.filter((x) => x != null && String(x).trim() !== '').length > 0 : false;
  return nonEmpty(filter['industry']) || nonEmpty(filter['pipeline_stage']);
}

/** Build Rex's research-brief prompt for the campaign objective. Prose output —
 *  a tight brief the synthesis step folds in, not a structured object. */
export function buildResearchPrompt(ctx: StrategyContext): string {
  return `Research the current context for a BTS social media campaign so the strategist can ground it in what's actually happening now.

## Campaign objective
${ctx.objective}

## What to return
A tight brief (≤6 short bullet points) covering only what's decision-useful:
- Relevant current developments, regulatory shifts, or market context in the Australian Bitcoin-treasury space.
- What competitors or adjacent voices are saying on this topic.
- Any timely hook the campaign could legitimately ride.

Cite specifics where you can. No hype, no price predictions, no recommendations. If you can't verify something, say so rather than guessing. Keep it to the brief — the strategist writes the strategy, not you.`;
}

/** Build Bruno's audience-analysis prompt. CRM company names (matched on the
 *  audience_filter) are supplied as context when available. Prose output. */
export function buildAudiencePrompt(ctx: StrategyContext, companyNames: string[]): string {
  const audience = formatAudienceFilter(ctx.audienceFilter);
  return `Characterise the audience for a BTS social media campaign so the strategist can frame the copy to their real concerns. This is context-conditioning — social is broadcast, not a recipient list.

## Audience
${audience ? `Filter: ${audience}` : '(no structured filter)'}
${ctx.audiencePersona ? `Persona: ${ctx.audiencePersona}` : ''}
${companyNames.length ? `Representative companies from the CRM in this segment: ${companyNames.join(', ')}` : ''}

## What to return
A short analysis (≤6 short bullet points):
- The pain points and objections this audience actually has about Bitcoin on a corporate balance sheet.
- The framing and language that lands with finance leaders (and what reads as hype to them).
- What this segment needs to hear to move from sceptical to curious.

Plain, specific, no jargon dumps. No recommendations to buy or allocate — this is about how to talk to them, not what to tell them to do.`;
}

/** Build Margot's strategy-synthesis prompt. Emits the structured strategy
 *  object the Gate 1 UI renders. `instruction` is set on a regenerate. */
export function buildStrategyPrompt(ctx: StrategyContext, instruction?: string): string {
  return `You are synthesising the marketing strategy for one BTS social media campaign. Read the campaign, the audience, the brand voice, and any prior-campaign learnings, then emit a structured strategy that makes a batch of many posts feel like one coherent argument.

${contextHeader(ctx)}

## Emit the strategy object
- content_pillars: the 3–5 recurring themes the campaign returns to.
- key_messages: the specific claims every reader should come away with.
- audience_summary: one or two sentences characterising who this is for.
- tone_guidance: credible, calm, never speculative; explain jargon when used.
- hooks: opening devices Charlie can reach for (e.g. a balance-sheet number).
- hashtags: a small set; let the copy carry the post.
- do_not_say: put real teeth here — price predictions, guaranteed returns, and personal-advice framing are out.
- success_signals: what tells us the campaign is working (e.g. inbound from finance leaders).

## Hard rules
- "Bitcoin" (capital B) = the network/protocol; "bitcoin" (lowercase b) = the currency/unit.
- No crypto-native hype (no "HODL", "to the moon", "diamond hands", rocket framing). No exclamation marks.
- Ground the strategy in the brand voice and the prior-campaign learnings, not generic marketing instincts.
${instruction ? `\n## Requested change (regenerate addressing this)\n${instruction}\n` : ''}
${NO_TOOL_INSTRUCTION}`;
}

/** Render the approved strategy as a compact block for the beat-plan prompt. */
function formatStrategy(strategy: StrategyObject): string {
  const line = (label: string, items: string[]): string =>
    items.length ? `${label}: ${items.join('; ')}` : '';
  return [
    line('Content pillars', strategy.content_pillars),
    line('Key messages', strategy.key_messages),
    strategy.audience_summary ? `Audience: ${strategy.audience_summary}` : '',
    strategy.tone_guidance ? `Tone: ${strategy.tone_guidance}` : '',
    line('Hooks', strategy.hooks),
    line('Do NOT say', strategy.do_not_say),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Build Margot's beat-plan prompt. She returns ordered beats only — the
 *  schedule across slots is computed deterministically afterwards. */
export function buildBeatPlanPrompt(
  ctx: StrategyContext,
  strategy: StrategyObject,
  instruction?: string,
): string {
  const accounts = ctx.accounts.map((a) => `${a.display_name} (${a.platform})`).join(', ');
  // A rough sense of how many beats the cadence wants, so Margot doesn't plan a
  // handful of beats for an 8-week run or forty for a 1-week one. posts_per_week
  // is a TOTAL across accounts (Phase 1), so beats ≈ total posts ÷ accounts.
  const totalPosts = ctx.postsPerWeek * ctx.durationWeeks;
  const accountCount = Math.max(ctx.accounts.length, 1);
  const suggestedBeats = Math.max(1, Math.round(totalPosts / accountCount));

  return `You are planning the ordered beats for one BTS social media campaign. A beat is the platform-agnostic CORE IDEA that fans out into many variants — one beat becomes a post for each participating account, in each account's own voice. Plan beats, not posts.

${contextHeader(ctx)}

## Approved strategy (locked once this plan is approved)
${formatStrategy(strategy)}

## Cadence
Participating accounts: ${accounts || '(none)'}
Posts per week (total across accounts): ${ctx.postsPerWeek}
Duration: ${ctx.durationWeeks} weeks
Plan roughly ${suggestedBeats} beat${suggestedBeats === 1 ? '' : 's'} — enough to cover the run without repeating yourself, sequenced so the argument builds.

## Emit ordered beats
Each beat:
- title: a short internal name.
- core_message: the ONE platform-agnostic idea every variant of this beat expresses.
- rationale: why this beat exists and what it achieves in the sequence.
- prefer_thread: true only when the idea genuinely warrants an X thread (a multi-step argument), false for a single point.

One idea per beat. Order them so each builds on the last.

## Hard rules
- "Bitcoin" (capital B) = the network/protocol; "bitcoin" (lowercase b) = the currency/unit.
- No hype, no exclamation marks. Stay inside the strategy's do_not_say.
${instruction ? `\n## Requested change (regenerate addressing this)\n${instruction}\n` : ''}
${NO_TOOL_INSTRUCTION}`;
}

interface PriorPost {
  title: string | null;
  type: string | null;
  impressions: number | null;
  reactions: number | null;
}

/** Format a handful of published posts + their metrics into a learnings block
 *  Margot reads. Pure so it can be unit-tested; the caller does the querying. */
export function formatPriorLearnings(posts: PriorPost[]): string {
  if (posts.length === 0) return '';
  const lines = posts.map((p) => {
    const title = p.title?.trim() || '(untitled)';
    const metrics: string[] = [];
    if (p.impressions != null) metrics.push(`${p.impressions} impressions`);
    if (p.reactions != null) metrics.push(`${p.reactions} reactions`);
    const tail = metrics.length ? ` — ${metrics.join(', ')}` : '';
    return `- ${title}${p.type ? ` (${p.type})` : ''}${tail}`;
  });
  return `What landed on prior campaigns (let what worked inform this one):\n${lines.join('\n')}`;
}
