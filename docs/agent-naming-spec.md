# Agent Naming Convention
**Status:** Approved  
**Affects:** All agents, Simon dialogue, Agent Activity UI, database, Mastra registration

---

## Canonical Name Registry

Every specialist agent has a **playful first name** used consistently across the codebase, UI, and Simon's outbound messages. Simon refers to them by first name only — like a small, tight team.

| Canonical ID | Display Name | Role Summary |
|---|---|---|
| `simon` | Simon | Orchestrator. The human-facing interface. Delegates to the team. |
| `roger` | Roger | The Recorder — captures calls, transcripts, Signal messages |
| `archie` | Archie | The Archivist — RAG, knowledge base, retrieval |
| `petra` | Petra | The PM — tasks, projects, deadlines, blockers |
| `bruno` | Bruno | The BA — data extraction, pattern analysis, structured insight |
| `charlie` | Charlie | Content Creator — drafts, LinkedIn posts, newsletters, ideas |
| `rex` | Rex | The Researcher — web search, market intelligence, monitors |
| `della` | Della | Relationship Manager — CRM, customer understanding, pipeline advice |

The **Canonical ID** is the `agent_name` value used in the `agent_activity` table and Mastra agent registration. The **Display Name** is what appears everywhere a human can see it.

---

## Implementation Requirements

### 1. Mastra Agent Registration

Each agent's Mastra `Agent` instance must use the canonical ID as its name:

```typescript
// apps/agents/src/agents/charlie.ts
export const charlie = new Agent({
  name: 'charlie',
  instructions: `You are Charlie, BTS's content creation specialist...`,
  // ...
});
```

The `instructions` field should open with the agent's name and role so that when Simon passes context between agents, each one has a stable self-concept. Charlie knows he's Charlie.

---

### 2. `agent_activity` Table — `agent_name` Values

The `agent_name` column in `agent_activity` must use canonical IDs only. No legacy values like `'content_agent'`, `'coordinator'`, or `'crm'`.

**Migration note:** If the schema has been seeded with old values, run a one-time update before go-live. The valid set is:

```sql
-- Valid agent_name values (add as a CHECK constraint if desired)
CHECK (agent_name IN ('simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex', 'della'))
```

Consider adding this constraint to the `agent_activity` table in the next schema revision.

---

### 3. Simon's Dialogue — Referencing the Team

When Simon sends a message to the user (via Signal or the Simon Interface), he refers to specialist agents by **first name only**, as colleagues — not as systems or services.

**Tone guidance:**

| ❌ Don't | ✅ Do |
|---|---|
| "The content agent has drafted a post." | "Charlie's put together a draft — want to see it?" |
| "The task agent has created 3 items." | "Petra's added those to the board — I've flagged them as high priority." |
| "The researcher agent found relevant articles." | "Rex came back with a few things worth reading." |
| "Processing via the archivist agent." | "I'll get Archie to pull that up." |

Simon's voice should make the team feel *real*. The agent names are part of building that sense of a capable, coordinated crew operating behind Simon.

**Prompt engineering:** Simon's system prompt must include the full name registry and the directive to use first names in all user-facing output:

```typescript
// In Simon's system prompt (excerpt)
`
Your specialist team:
- Roger handles all recording and transcription
- Archie manages the knowledge base and retrieval  
- Petra owns tasks, projects, and deadlines
- Bruno analyses data and extracts structured insight
- Charlie creates all content — posts, drafts, newsletters
- Rex researches markets, monitors topics, hunts down information
- Della manages relationships, understands customers, and keeps the CRM sharp

Always refer to them by first name when talking to the user.
Never say "the content agent" — say "Charlie".
Never say "I'll dispatch a specialist" — say who you're going to.
`
```

---

### 4. Agent Activity UI

The Agent Activity page must display the **Display Name**, not the canonical ID.

```typescript
// packages/shared/src/agents.ts
export const AGENT_REGISTRY: Record<string, { displayName: string; role: string }> = {
  simon:   { displayName: 'Simon',   role: 'Orchestrator' },
  roger:   { displayName: 'Roger',   role: 'The Recorder' },
  archie:  { displayName: 'Archie',  role: 'The Archivist' },
  petra:   { displayName: 'Petra',   role: 'The PM' },
  bruno:   { displayName: 'Bruno',   role: 'The BA' },
  charlie: { displayName: 'Charlie', role: 'Content Creator' },
  rex:     { displayName: 'Rex',     role: 'The Researcher' },
  della:   { displayName: 'Della',   role: 'Relationship Manager' },
};

// Usage in AgentActivityCard component
const agent = AGENT_REGISTRY[activity.agent_name];
// Renders: "Charlie · Content Creator"
```

The `AgentActivityCard` should show the display name prominently, with the role subtitle in `--color-text-secondary`. Avoid showing raw canonical IDs anywhere in the UI.

---

### 5. Approval Cards in the Simon Interface

When Simon surfaces an approval card to the user, the header should name who's involved:

> **Charlie has a draft ready**  
> LinkedIn post · 2 min ago  
> *[Preview content]*  
> `Love it` · `Needs work` · `Skip`

And for a delegation notice:

> **Simon → Rex**  
> Researching ASIC guidance on corporate bitcoin holdings...

This makes the human-in-the-loop experience feel like reading a message from a real team, not watching a loading spinner.

---

### 6. Capacity Gap Logging

When Simon logs to `capacity_gaps` because a task can't be routed, the `agent_name` field should still use the canonical ID (for consistency with `agent_activity`). The description field can use the display name:

```json
{
  "agent_name": "rex",
  "gap_type": "missing_tool",
  "description": "Rex needs a Jina Reader fallback for paywalled content"
}
```

---

## Out of Scope

- Agent *personalities* beyond naming (tone, style, persona depth) — covered in individual agent specs under `docs/agents/`
- Public-facing use of these names — this is internal only; the BTS brand doesn't expose agent names externally
- Avatar or icon assignment per agent — nice future idea, defer until the UI needs it

---

## Open Question

Should Simon ever **introduce the team** to a new user during onboarding? E.g.:

> "Just so you know, behind the scenes you've got: Charlie for content, Rex for research, Petra keeping the projects in order, and Archie holding onto everything we learn. I coordinate them — you just talk to me."

This is a nice touch for the first-run experience. Flagged for the Simon Interface spec.
