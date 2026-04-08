# Review: Agent Memory Management — Top 3 Improvements

## Context

The agent server (`apps/agents/`) uses Mastra `@mastra/core` ^0.14.0 with 6 agents and 3 workflows. **No Mastra Memory class is used.** Conversation history is stored as an unbounded JSONB array in `agent_conversations.messages` and the **entire array** is passed to `simon.generate()` on every request with zero token management, trimming, or structured memory.

This is a ticking time bomb: as conversations grow, the platform will hit the model's context window limit (causing errors or silent truncation), costs will escalate linearly with conversation length, and Simon has no persistent awareness of director preferences or platform state between restarts.

### Current flow (both Signal and Web)
```
message arrives → fetch full messages[] from agent_conversations
→ map ALL to CoreMessage[] → simon.generate(allMessages)
→ append response → persist full array back
```

### Key files examined
- `apps/agents/src/mastra/index.ts` — Mastra init (no memory/storage config)
- `apps/agents/src/agents/simon/index.ts` — Agent definition (no Memory instance)
- `apps/agents/src/listeners/signalListener.ts` — Full history replay, no trimming
- `apps/agents/src/listeners/webDirectives.ts` — Same pattern, duplicated ConvMessage type
- `apps/agents/src/config/model.ts` — Model config (claude-sonnet-4-5)

### Note on scope
This is a **review document** with three ranked improvement suggestions. It does not propose implementing all three at once. Each improvement is independent and can be adopted incrementally. The recommendations are ordered by urgency.

---

## Improvement #1: Add Token-Limited Message History via Mastra Memory

**Risk: Critical — this is the thing that breaks first.**

### Problem
Every message adds ~50-200 tokens to the conversation. After a few weeks of daily use, the JSONB array will contain hundreds of messages. All are passed to `simon.generate()` with no token counting. Claude Sonnet 4.5 has a 200K context window, but the system prompt + tools already consume a significant portion. Once the conversation exceeds available context, the API will error or (worse) silently drop messages, causing Simon to lose context mid-conversation.

### Solution
Adopt Mastra's built-in `Memory` class with a `TokenLimiter` processor. This replaces the manual JSONB conversation management with Mastra's thread/resource model and automatically prunes old messages to stay within a token budget.

### What changes

**`apps/agents/package.json`** — add dependency:
```
pnpm add @mastra/memory @mastra/pg
```

**`apps/agents/src/config/memory.ts`** (new file):
```ts
import { Memory } from '@mastra/memory';
import { TokenLimiter } from '@mastra/memory/processors';

export const memory = new Memory({
  options: {
    lastMessages: 40,           // keep last 40 messages as baseline
    semanticRecall: false,      // enable later if needed
  },
  processors: [
    new TokenLimiter({ limit: 80_000 }), // safe budget for Sonnet's 200K window
  ],
});
```

**`apps/agents/src/mastra/index.ts`** — add PostgreSQL storage to Mastra:
```ts
import { PostgresStore } from '@mastra/pg';

const storage = new PostgresStore({
  connectionString: process.env.SUPABASE_DB_URL!,
});

export const mastra = new Mastra({
  agents: { ... },
  storage,  // Mastra auto-creates its tables (mastra_threads, mastra_messages, etc.)
});
```

**`apps/agents/src/agents/simon/index.ts`**:
- Add `memory` to the Agent constructor: `new Agent({ name, instructions, model, tools, memory })`

**`apps/agents/src/listeners/signalListener.ts`** — the core change:
```ts
// BEFORE: manual JSONB array management
const messagesForSimon: CoreMessage[] = updatedMessages.map(m => ({ ... }));
const result = await simon.generate(messagesForSimon);

// AFTER: Mastra Memory handles persistence and retrieval
const result = await simon.generate(userMessage, {
  memory: {
    resource: senderNumber,        // director identity (persists across threads)
    thread: `signal-${senderNumber}`, // conversation thread
  },
});
```
- Remove the manual `agent_conversations` fetch/append/persist cycle
- Remove duplicated `ConvMessage` type
- Keep the `agent_conversations` write as a **side-effect** so the web UI can still read it (dual-write during migration)

**`apps/agents/src/listeners/webDirectives.ts`** — same pattern:
```ts
const result = await simon.generate(lastMessage.content, {
  memory: {
    resource: 'web-director',
    thread: conv.id,
  },
});
```

### Migration path
- Mastra Memory auto-creates its own tables (`mastra_threads`, `mastra_messages`, etc.) — no conflict with `agent_conversations`
- Dual-write during transition: Memory manages the real history, `agent_conversations` kept as a read-only projection for the web UI
- Once `apps/web` is migrated to read from Mastra's tables, drop the dual-write
- **No env var changes needed** if `SUPABASE_DB_URL` (direct Postgres connection string) is already set. If only the Supabase JS client URL is available, you'll need to add the direct Postgres connection string.

### Director differentiation
The current system already keys conversations by `signal_chat_id` (= sender's phone number). Mastra Memory formalises this:

| Concept | Maps to | Example |
|---------|---------|---------|
| `resourceId` | Director's phone number or identity | `+61400123456` |
| `threadId` | Unique conversation | `signal-+61400123456` |

Each Signal sender gets a unique `resourceId`, so their message history and working memory (Improvement #2) are automatically isolated. If a new director or external contact messages Simon in the future, they get their own resource — no code changes needed. The web UI uses a fixed resource like `web-director-{userId}` keyed to the authenticated user.

For multi-director scenarios where both directors share a group chat, the `threadId` would be the group ID while each director's `resourceId` stays separate — Mastra Memory handles this natively.

### Gotchas
- **Each thread has an immutable owner** (`resourceId`). Don't reuse the same thread ID for different directors.
- Mastra's `lastMessages` default changed to 10 in 2026 — explicitly set to 40 to avoid unexpectedly short context.
- The `agent_conversations` dual-write adds a small overhead per message. Remove once web UI is migrated.

---

## Improvement #2: Working Memory for Persistent Director Context

**Risk: Medium — quality degradation, not a crash.**

### Problem
Simon has no persistent structured memory. Every conversation starts from zero context about who the directors are, their preferences, ongoing projects, or recent decisions. Simon's system prompt says "Always query conversation history before responding" but there's no mechanism to do this — Simon just receives the raw message history and hopes the relevant context is somewhere in it.

### Solution
Use Mastra's **Working Memory** with a Zod schema to maintain structured, persistent context about each director. Working Memory is automatically injected into the system prompt and updated by the agent after each interaction — no explicit tool calls needed.

### What changes

**`apps/agents/src/config/memory.ts`** (extend from Improvement #1):
```ts
import { z } from 'zod';

const workingMemorySchema = z.object({
  directorName: z.string().describe('Name of the director'),
  preferences: z.string().describe('Communication preferences, formatting, timezone'),
  activeProjects: z.string().describe('Currently active projects and their status'),
  recentDecisions: z.string().describe('Key decisions made in recent conversations'),
  pendingItems: z.string().describe('Items awaiting director input or approval'),
  notes: z.string().describe('Other persistent context Simon should remember'),
});

export const memory = new Memory({
  options: {
    lastMessages: 40,
    semanticRecall: false,
    workingMemory: {
      enabled: true,
      schema: workingMemorySchema,
      scope: 'resource',  // persists across all threads for same director
    },
  },
  processors: [
    new TokenLimiter({ limit: 80_000 }),
  ],
});
```

**`apps/agents/src/agents/simon/index.ts`**:
- Add guidance to Simon's system prompt about working memory: "You have working memory that persists across conversations. Update it when you learn new preferences, project changes, or important decisions."

### Migration path
- Working Memory is additive — it starts empty and fills as Simon interacts
- No data migration needed; Simon builds context organically
- Resource-scoped so each director gets their own persistent context
- Working Memory uses merge semantics: Simon only provides fields to update, preserving existing data

### Gotchas
- Working Memory content is injected into the system prompt — the Zod schema fields should be concise to avoid bloating the prompt
- With `scope: 'resource'`, working memory persists across ALL threads for the same director. If a director has both Signal and web threads, they share the same working memory (which is desirable here).

### Dependencies
- Requires Improvement #1 (Memory class) to be in place first

---

## Improvement #3: Observational Memory for Long-Running Conversations

**Risk: Lower urgency, high value for long-term quality and cost.**

### Problem
Even with token limiting (Improvement #1), old messages are simply dropped. Over weeks/months of conversation, Simon loses all context about early interactions. A director might say "remember when we discussed the Jones proposal?" and Simon will have no recollection because those messages were pruned. The alternative — keeping all messages — is prohibitively expensive and hits context limits.

### Solution
Use Mastra's **Observational Memory**, which runs two background AI agents (Observer and Reflector) that compress conversation history into dense observation logs. This achieves 5-40x compression while maintaining 95% accuracy on long-context benchmarks. Old messages are pruned by the TokenLimiter, but their semantic content is preserved in compressed observations that are injected into the system prompt.

### What changes

**`apps/agents/src/config/memory.ts`** (extend from Improvements #1 and #2):
```ts
export const memory = new Memory({
  options: {
    lastMessages: 40,
    semanticRecall: false,
    workingMemory: {
      enabled: true,
      schema: workingMemorySchema,
      scope: 'resource',
    },
    observationalMemory: {
      enabled: true,
      observerThresholdTokens: 30_000,  // compress when context hits 30K tokens
      reflectorThresholdTokens: 40_000, // meta-compress at 40K tokens
      previousObserverTokens: 4_000,    // budget for observation context
    },
  },
  processors: [
    new TokenLimiter({ limit: 80_000 }),
  ],
});
```

### Migration path
- Additive — observations build up over time from new conversations
- No historical data migration (can't retroactively observe old JSONB messages, but this is fine — the system improves going forward)
- Observer/Reflector use separate LLM calls — adds latency and cost per message, but far less than replaying full history

### Gotchas — cost implications
- Observer/Reflector make **additional LLM calls per message** once thresholds are hit. For a pre-revenue startup, this is real money.
- Consider using Mastra's `ModelByInputTokens` routing to send Observer/Reflector calls to a cheaper model (e.g., Haiku for short inputs, Sonnet only for longer ones).
- The Observer fires at 30K tokens — for typical conversations this won't trigger until 150+ messages. The cost impact is gradual, not immediate.
- Can be disabled with `observationalMemory: false` if costs become a concern, falling back to Improvements #1 and #2 only.

### Dependencies
- Requires Improvements #1 and #2 to be in place
- The property name is `observationalMemory` (not `observation`) in the Mastra Memory options

---

## Additional Cleanup (bundled with Improvement #1)

- **Deduplicate `ConvMessage` type**: Currently defined identically in both `signalListener.ts` and `webDirectives.ts`. Move to `@platform/shared` or to a local `types.ts` in the listeners directory.
- **Environment variable**: Ensure `SUPABASE_DB_URL` (direct Postgres connection string, not the Supabase REST URL) is available in the Railway environment for `PostgresStore`.
- **CLAUDE.md update**: Add a "Memory" subsection to document the thread/resource model and which agents use Memory.

---

## Verification

1. **Build**: `pnpm --filter @platform/agents typecheck` passes after changes
2. **Smoke test**: Send a Signal message, verify Simon responds and conversation persists in `mastra_messages` table
3. **Token limit test**: Create a test conversation with 100+ messages, verify TokenLimiter prunes to budget (check logged token counts)
4. **Working Memory test** (Improvement #2): Have a multi-turn conversation, restart the server, verify Simon remembers director context
5. **Regression check**: Verify `agent_conversations` table is still populated (dual-write) so web UI is unaffected
6. **Cost monitoring**: Compare token usage per message before/after on a representative conversation
