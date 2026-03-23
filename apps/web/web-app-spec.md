# Web App Specification — BTS Internal Platform

**App:** `apps/web` (Next.js → Vercel)  
**Status:** Pre-build — this document is the design authority before any component is written  
**Read alongside:** `docs/design-brief.md` (visual system) · `schema.sql` (data model) · `docs/agents/simon.md` (agent behaviour)

-----

## Purpose and Scope

This document specifies every page, view, and interaction pattern for the BTS internal web frontend. It is written for Claude Code and covers:

- URL structure and routing
- Page-level data requirements (what each view fetches)
- Component behaviour and state
- The Simon interface — the AI interaction layer
- CRUD operations across all entities
- Agent approval flows within the web context

The visual system (colours, typography, spacing, tokens, component specs) lives in `docs/design-brief.md`. This document references that spec but does not duplicate it. When a conflict arises, this document governs behaviour; `docs/design-brief.md` governs appearance.

-----

## Technology

- **Framework:** Next.js App Router (`apps/web`)
- **Data fetching:** Supabase client from `@platform/db` — use server components for initial data, client components for real-time and interactive mutations
- **Real-time:** Supabase Realtime subscriptions for agent activity feed and Simon thread
- **State:** React Server Components for static data; `useState`/`useReducer` for local UI state; no global state library unless complexity demands it
- **Forms:** React Hook Form + Zod for validation (types from `@platform/shared`)
- **Icons:** Lucide React, `stroke-width={1.5}` throughout
- **Fonts:** Load via `next/font` — Playfair Display, DM Sans, JetBrains Mono

-----

## URL Structure

```
/                          → Dashboard
/simon                     → Simon Interface (primary AI interaction)
/crm                       → Redirects to /crm/contacts
/crm/contacts              → Contacts list
/crm/contacts/[id]         → Contact detail
/crm/companies             → Companies list
/crm/companies/[id]        → Company detail
/tasks                     → Tasks (list view, default)
/tasks/[id]                → Task detail (slide-over, not full page)
/projects                  → Projects list
/projects/[id]             → Project detail
/content                   → Content pipeline board
/content/[id]              → Content item editor
/activity                  → Agent Activity feed
/brand                     → Brand Hub asset library
/settings                  → Settings (redirects to /settings/team)
/settings/team             → Team members
/settings/integrations     → Integrations status
```

-----

## App Shell

The entire authenticated app is wrapped in a persistent shell component. This renders on every route.

### Layout

```
┌──────────────────────────────────────────────────────┐
│  Sidebar (240px)  │  Page Header (sticky, 64px)      │
│                   │─────────────────────────────────  │
│  [BTS logo mark]  │                                   │
│                   │  Content Area                     │
│  Nav items        │  (--color-bg background,          │
│  (grouped)        │   scrolls independently)          │
│                   │                                   │
│  ─────────────    │                                   │
│  [Settings]       │                                   │
│  [Your name]      │                                   │
└──────────────────────────────────────────────────────┘
```

### Sidebar

- Background: `--color-surface-subtle`
- Right border: 1px `--color-border`
- Fixed position, full viewport height
- **Logo mark:** “BTS” in Playfair Display, weight 700, `--color-text-primary`, 20px. Below it: “Internal” in DM Sans, 11px, `--color-text-tertiary`, uppercase, letter-spacing 0.08em
- **Nav items** (see Navigation Order below): Lucide icon (18px) + label (DM Sans, 14px, weight 500)
  - Default: `--color-text-secondary`, no background
  - Hover: `--color-surface` background
  - Active: `--color-accent-subtle` background, 3px `--color-accent` left border, `--color-text-primary` text, icon in `--color-accent`
- **Section groupings:** 11px DM Sans, uppercase, `--color-text-tertiary`, 0.04em letter-spacing — used to separate CRM/work items from system items
- **Bottom area:** Settings link, then the current user’s name + avatar initials in a 28px circle (`--color-accent-subtle` background, `--color-accent` text)
- **Pending approvals badge:** If there are pending items in `agent_activity` with `status = 'pending'`, show a small count badge on the Simon nav item — accent colour, 16px, DM Sans weight 600

### Navigation Order

```
─── WORK ───────────
Dashboard           (LayoutDashboard icon)
Simon               (Bot icon — badge if pending approvals)
CRM                 (Users icon — expands to Contacts / Companies sub-items)
Tasks               (CheckSquare icon)
Projects            (FolderOpen icon)
Content             (FileText icon)
─── SYSTEM ─────────
Agent Activity      (Activity icon)
Brand Hub           (Bookmark icon)
Settings            (Settings icon — bottom)
```

Simon is second in the nav, immediately below Dashboard. It is a first-class section, not a widget or utility. This communicates its importance.

### CRM Sub-navigation

When /crm/* is active, the CRM item expands inline in the sidebar to show:

- Contacts (with contact count)
- Companies (with company count)

These are indented 12px, DM Sans 13px, weight 400.

### Page Header

- Background: `--color-surface`
- Bottom border: 1px `--color-border`
- Height: 64px
- Sticky (stays at top on scroll)
- Left: current page title (Playfair Display, H1 spec — 28px, weight 600)
- Right: primary action button for the current page (e.g. “Add contact”, “New task”) + any secondary controls (filters, view toggles)

### Responsive Behaviour

- Below 1024px: sidebar collapses to 64px icon-only. Label tooltips on hover.
- Below 768px: sidebar hidden, replaced by bottom tab bar with 5 items (Dashboard, Simon, CRM, Tasks, Content). Agent Activity / Brand Hub / Settings accessible via a “More” tab.

-----

## Simon Interface — `/simon`

This is the most important screen in the platform. It is not a chat widget or a floating panel — it is a dedicated first-class page that serves as the primary interface between the founders and the entire agent system.

### Concept

Simon communicates with founders primarily via Signal. The web interface provides a richer version of that same conversation — with structured approval cards, context panels, and the full history of every directive, response, and action. Think of it as a Signal thread that grew up: the same natural language, but with more room to breathe.

Importantly, approvals that arrive via Signal should also appear here. The web view is a superset of the Signal conversation, not a separate channel.

### Layout

```
┌─────────────────────────────────┬─────────────────────┐
│  Thread panel (left, ~65%)      │  Context panel       │
│                                 │  (right, ~35%)       │
│  [message history, scrollable]  │  [detail of selected │
│                                 │   item or entity]    │
│  ─────────────────────────────  │                      │
│  [Compose area, sticky bottom]  │                      │
└─────────────────────────────────┴─────────────────────┘
```

On screens below 1280px: context panel collapses into a slide-over drawer triggered by clicking a message item.

### Thread Panel

The thread is a chronological feed of all interactions with Simon. Each item is one of three types:

**Type 1 — Director message** (sent by a founder)

- Right-aligned, `--color-accent-subtle` background, `12px` radius
- DM Sans, 15px, `--color-text-primary`
- Timestamp: JetBrains Mono, 11px, `--color-text-tertiary`, below message right
- Source badge: “Web” or “Signal” — tiny pill, 11px, `--color-surface-subtle`

**Type 2 — Simon response** (text)

- Left-aligned, `--color-surface` background, `1px --color-border` border, `12px` radius, `--shadow-sm`
- Agent identifier: “Simon” label + Bot icon (16px) above the bubble, DM Sans 12px weight 600, `--color-text-secondary`
- DM Sans, 15px, `--color-text-primary`
- Timestamp: same as above

**Type 3 — Approval card** (proposed actions)

- Left-aligned, full thread width (not a bubble)
- `--color-surface` background, `1px --color-border` border, `12px` radius, `--shadow-sm`
- `--color-warning` left border (3px) when pending; changes to `--color-success` or `--color-destructive` once resolved
- **Header row:** “Simon · Proposed [N] action[s]” (DM Sans, 14px, weight 600) + timestamp + trigger context (“From call transcript · Marcus Chen · 22 Mar”, `--color-text-secondary`, 13px)
- **Action list:** each proposed action on its own row — icon + plain English description + affected record (linked, opens context panel)
  
  Example action rows:
  
  ```
  ✦  Create contact  →  Marcus Chen, CFO at Meridian Capital
  ✦  Log interaction  →  Call, 22 Mar, 14 min
  ✦  Create task  →  "Follow up re: treasury allocation" · Assigned to Chris · Due 29 Mar
  ```
- **Approval controls** (shown only when `status = 'pending'`):
  - Primary button: “Approve all” — approves all proposed actions in one click
  - Ghost button: “Review” — expands each action individually with per-item approve/reject
  - Ghost destructive button: “Reject all”
  - Free-text input field below buttons with placeholder: “Or respond to Simon…” — accepts conversational approval (“looks good”, “do it”, “reject the task but approve the rest”)
  - Send button next to the input field
- **Resolved state:** Replace approval controls with a resolved badge — “Approved by Chris · 22 Mar 14:32” or “Rejected” — in 12px DM Sans, `--color-text-tertiary`. Show which actions were approved vs rejected if mixed.

**Scroll behaviour:** Thread starts at the bottom (most recent). New messages auto-scroll to bottom unless the user has scrolled up (standard chat UX). Show a “New messages ↓” pill when new items arrive and the user is scrolled up.

**Real-time:** Subscribe to `agent_activity` table via Supabase Realtime. New `pending` rows for Simon trigger a new approval card in the thread without page refresh.

### Compose Area

Sticky at the bottom of the thread panel.

- Textarea (auto-expanding, max 5 lines): DM Sans, 15px, placeholder “Send a directive to Simon…”
- Submit button: primary, “Send”
- Keyboard shortcut: `Cmd/Ctrl + Enter` to send
- Below the textarea: small hint text in 12px `--color-text-tertiary` — “Simon will propose actions for your approval before executing”
- When the textarea has content: hint text hides, submit button activates

### Context Panel

Displays detail about the currently selected entity from an approval card, or the most recently mentioned entity in the thread.

- If a contact is selected: shows contact summary — name, company, pipeline stage, last interaction, open tasks
- If a task is selected: shows task detail — title, description, due date, assigned to, linked contact
- If nothing is selected: shows a summary of today’s open approvals and pending items

This panel is read-only in the Simon view — it provides context, not editing. “Open full record” link at the bottom of each context card navigates to the full CRUD view.

### Empty State

First time / no history:

- Centred in thread panel
- Bot icon at 48px, `--color-text-tertiary`
- “Start a conversation with Simon” (Playfair Display H3)
- “Send a directive and Simon will coordinate the right agents to get it done.” (DM Sans, 14px, `--color-text-secondary`)
- No CTA button needed — compose area is always visible

-----

## Dashboard — `/`

The daily briefing view. Not a KPI wall — a practical summary of what needs attention right now.

### Layout

Two-column grid on desktop (60/40 split), single column on mobile.

### Left column — Action required

**Pending Approvals widget**

- Shows count of pending items in `agent_activity` across all agents
- Each item shows: agent name, action summary, timestamp, quick “Approve” / “View” buttons
- Max 5 items shown; “View all in Agent Activity →” link below
- If zero: success state — “No pending approvals” with `--color-success` icon

**Open Tasks — assigned to me**

- Pulls from `v_open_tasks`, filtered to current user
- Sorted by: urgent > high > due date ascending
- Shows: task title, priority chip, due date (red if overdue, amber if today), linked contact name
- Max 8 items; “View all tasks →” link
- Inline “Mark complete” button on hover (ghost, small)

**Upcoming follow-ups**

- Contacts with `pipeline_stage IN ('warm', 'active')` and no interaction in the last 14 days
- Max 5 items; shows contact name, company, pipeline stage chip, days since last contact
- “Log interaction” quick action on hover

### Right column — Context

**Recent Agent Activity**

- Last 5 `agent_activity` rows, all agents, all statuses
- Shows: agent name badge + action + timestamp + status chip
- “View full log →” link
- Real-time via Supabase subscription

**Content pipeline summary**

- Count of items per status: idea / draft / review / approved / scheduled
- Simple horizontal bar or count chips — not a chart
- “Open content →” link

**Quick-add strip** (bottom of right column)

A row of four ghost buttons for the most common creation actions:

- “+ Contact”
- “+ Task”
- “+ Content idea”
- “+ Note” (creates an interaction of type `note`)

Each opens the relevant create modal.

-----

## CRM

### Contacts — `/crm/contacts`

**Page header actions:** “Add contact” (primary button) + search input + filter dropdown

**Filter options:**

- Pipeline stage (multi-select chips: lead / warm / active / client / dormant)
- Owner (team member dropdown)
- Bitcoin literacy
- Has open tasks (toggle)
- Company

**List view:**

Uses the Data Table component from `docs/design-brief.md`.

|Column      |Content                                                                        |Width|
|------------|-------------------------------------------------------------------------------|-----|
|Name        |Full name (linked) + job title below in 12px secondary                         |25%  |
|Company     |Company name (linked)                                                          |20%  |
|Pipeline    |Stage chip                                                                     |12%  |
|Owner       |Avatar + name                                                                  |12%  |
|Last contact|Date of most recent interaction, relative (“3 days ago”) in JetBrains Mono 13px|15%  |
|Open tasks  |Count badge (accent if >0)                                                     |8%   |
|Actions     |“…” menu: Edit, Log interaction, Add task, Delete                              |8%   |

- Row click navigates to `/crm/contacts/[id]`
- Sortable columns: Name, Company, Last contact
- Sticky header
- Pagination: 25 per page

**Empty state:** “No contacts yet” — encourage first add.

**Create Contact modal:**

Triggered by “Add contact” button. Slide-over panel from the right (not a centred modal — there are many fields).

Fields:

- First name (required) / Last name (required) — side by side
- Job title
- Email / Phone — side by side
- Company (combobox: search existing companies or create new inline — “Create ‘[typed name]’” option at bottom of dropdown)
- Pipeline stage (segmented control or select — default: `lead`)
- Bitcoin literacy (select — default: `unknown`)
- Owner (team member select — default: current user)
- Tags (multi-select tag input)
- Notes (textarea)

Footer: “Cancel” (ghost) + “Save contact” (primary)

Validation: first name and last name required. Email format if provided. Surface errors inline below each field.

-----

### Contact Detail — `/crm/contacts/[id]`

Full-page layout: left panel (contact info, ~35%) + right panel (activity timeline, ~65%).

**Left panel — Contact profile**

- Name as H1 (Playfair Display, 28px)
- Job title + Company name (linked to company detail) below
- Pipeline stage chip — click to change inline (dropdown)
- Bitcoin literacy badge
- Owner: avatar + name (click to reassign)
- Contact details section: email (click to copy), phone, LinkedIn URL — each with copy icon
- Tags: editable inline
- Notes: textarea, inline edit on click
- “Edit contact” button (secondary) — opens same slide-over as create
- “Delete contact” — destructive, confirmation required — in a `...` overflow menu
- Open tasks count: chip link to filtered tasks view

**Right panel — Interaction timeline**

Header: “Activity” label (H3) + “Log interaction” button (primary, small)

Timeline feed — chronological, most recent first. Each item:

- Type icon (Lucide): Phone for `call`, Mail for `email`, Users for `meeting`, MessageSquare for `signal`, LinkedIn for `linkedin`, StickyNote for `note`
- Type label + direction badge (`inbound` / `outbound` / `internal`) — direction badge only for call/email/meeting
- Timestamp: JetBrains Mono, 12px, `--color-text-tertiary`
- Source badge: `manual` / `coordinator_agent` / `signal` / `call_transcript` — small pill
- Summary text (agent-generated or manual): DM Sans, 14px, `--color-text-primary`
- Extracted data section (if populated): collapsible, shows decisions/action items/topics as small tagged chips
- “Edit” / “Delete” actions in a `...` menu on hover

**Log Interaction modal** (centred modal, medium width):

Fields:

- Type (segmented control: Call / Email / Meeting / Signal / Note / Other)
- Direction (radio: Inbound / Outbound / Internal) — hidden for Note type
- Date + time (datetime picker, default: now)
- Raw content (textarea — transcript, email body, notes)
- Summary (textarea — manual summary, or agent-generated if source is not `manual`)

Footer: “Cancel” + “Log interaction”

-----

### Companies — `/crm/companies`

Similar pattern to contacts list.

**Columns:**

|Column      |Content                                 |
|------------|----------------------------------------|
|Company name|Linked                                  |
|Industry    |Text                                    |
|Size        |Text                                    |
|Country     |Text                                    |
|Contacts    |Count (linked to filtered contacts view)|
|Open tasks  |Count badge                             |
|Actions     |Edit, Delete                            |

**Create/Edit Company modal** (centred, medium width):

Fields: Name (required), Industry, Size (select: SME / Mid-market / Enterprise), Country, Website (URL), LinkedIn URL, Notes.

-----

### Company Detail — `/crm/companies/[id]`

Similar two-panel layout.

Left: company profile — name, industry, size, country, website/LinkedIn links, notes, edit controls.

Right: tabbed panel

- **Contacts** tab: list of contacts at this company with pipeline stage chips and quick-navigate links
- **Interactions** tab: all interactions across all contacts at this company, same timeline component
- **Tasks** tab: open tasks linked to any contact at this company
- **Projects** tab: projects linked to this company

-----

## Tasks — `/tasks`

### Views

Toggle between **List** and **Board** (kanban) in the page header. Default: List. Persist preference in `localStorage`.

**List view:**

|Column  |Content                                                                                                                            |
|--------|-----------------------------------------------------------------------------------------------------------------------------------|
|Title   |Task title (linked to slide-over detail) + source badge if agent-created                                                           |
|Project |Project name chip (linked)                                                                                                         |
|Contact |Contact name (linked) if `related_contact_id` set                                                                                  |
|Assignee|Avatar + name                                                                                                                      |
|Priority|Priority chip (urgent = `--color-destructive` tint, high = `--color-warning` tint, medium = neutral, low = `--color-text-tertiary`)|
|Due date|Date in JetBrains Mono; red if overdue, amber if today, otherwise `--color-text-secondary`                                         |
|Status  |Status chip                                                                                                                        |
|Actions |Inline “Mark complete” on hover + `...` menu                                                                                       |

Filters (in page header): Status (multi-select), Assignee, Priority, Project, Source (manual / agent-created), Due date range.

**Board view:**

Kanban columns: `todo` · `in_progress` · `blocked` · `done` · `cancelled`

Each column:

- Header: column label + task count
- `done` and `cancelled` columns collapsed by default (click to expand)
- Cards: task title, priority chip, assignee avatar, due date, linked contact name
- Drag to reorder within column (updates `status`)
- Drag between columns (updates `status` + sets `completed_at` when moved to `done`)

**Create Task modal** (slide-over):

Fields:

- Title (required)
- Description (textarea)
- Project (combobox — search or create)
- Related contact (combobox — search contacts)
- Assigned to (team member select, default: current user)
- Priority (select: low / medium / high / urgent, default: medium)
- Due date (date picker)
- Tags (tag input)

-----

### Task Detail — Slide-over

Clicking a task title opens a slide-over from the right (not a new page).

Shows: all task fields in editable inline form. History section at the bottom showing when task was created (by whom / by which agent) and any status changes.

“Open full page” link if needed, but slide-over should suffice for most use.

Delete: destructive button in the slide-over footer, requires confirmation.

-----

## Projects — `/projects`

### List — `/projects`

Simple card grid (3 columns on desktop, 2 on tablet, 1 on mobile).

Each card:

- Project name (H3, Playfair Display)
- Status chip (active / on_hold / completed / archived)
- Related company name (if set)
- Open task count
- Created by + date

Filter: Status, Related company.

**Create Project modal** (centred, medium):

Fields: Name (required), Description, Status (default: active), Related company (combobox).

-----

### Project Detail — `/projects/[id]`

Header: project name (H1), status chip (click to change inline), related company link, description, edit/delete controls.

Below header: two-column layout.

Left (65%): Task list — same table component as `/tasks`, pre-filtered to this project. “Add task to project” creates a task with `project_id` pre-filled.

Right (35%): Project metadata card + linked company summary card.

-----

## Content Pipeline — `/content`

### Board view (default)

Horizontal kanban of content status stages: `idea` → `draft` → `review` → `approved` → `scheduled` → `published`

`archived` column hidden by default; toggle to show.

Each card:

- Title (or first 60 chars of body if no title)
- Type badge: LinkedIn / Twitter-X / Newsletter / Blog / Idea — with distinct but restrained colour per type (all within the warm palette — use `--color-accent-light` for active types, `--color-surface-subtle` for less active)
- Topic tags (max 3 visible, “+N more” chip if overflow)
- Assigned to: avatar
- Scheduled date (if set): JetBrains Mono, 12px
- Source badge if agent-created

Drag between columns updates `status`. Moving to `published` prompts for `published_url` and `published_at`.

**Create Content Item** (slide-over):

Fields:

- Type (segmented control: LinkedIn / Twitter-X / Newsletter / Blog / Idea)
- Title (optional for social, required for newsletter/blog)
- Body (rich textarea — markdown supported, monospace font option toggle)
- Topic tags (tag input, suggestions from existing tags)
- Scheduled for (datetime picker)
- Assigned to (team member)

-----

### Content Item Editor — `/content/[id]`

Full-page editor for longer-form content.

Left panel (60%): content body editor — textarea with markdown formatting shortcuts, word count, character count (useful for LinkedIn’s limits).

Right panel (40%):

- Metadata: type, status, topic tags, assigned to, scheduled date, published URL
- Status controls: advance/revert status with single buttons (“Move to Review”, “Approve”, “Schedule”)
- Source interaction link (if agent-generated from a call or Signal)
- Version note: show `created_at` + `updated_at`

-----

## Agent Activity — `/activity`

The full audit log. Every action every agent has ever taken or proposed.

### Feed view

**Filters (in page header):**

- Agent (multi-select: Simon / Recorder / Archivist / PM / BA / Content Creator)
- Status (multi-select: pending / approved / rejected / auto)
- Trigger type (call_transcript / signal_message / manual / scheduled)
- Date range

**Feed items:**

Same structure as the approval cards in the Simon thread (see above), but displayed as a full-width log. No compose area here — this is read-only observation.

Each item:

- Agent name + icon (each agent has a distinct Lucide icon assigned — Simon: `Bot`, Recorder: `Mic`, Archivist: `Archive`, PM: `ClipboardList`, BA: `Search`, Content Creator: `PenTool`)
- Action summary
- Trigger context
- Proposed actions list
- Status (pending / approved / rejected / auto) — with resolved timestamp and approver name if applicable
- Workflow run ID (monospace, 11px, `--color-text-tertiary`) — for tracing in Railway logs

**Pending items** appear at the top, regardless of date filter, separated by an “Awaiting approval” section header. Below that: historical items in reverse chronological order.

**Approval interaction:** For pending items, the same approval controls from the Simon thread are available here — “Approve all”, “Review”, “Reject all”, free-text input. Approvals submitted here are identical to those submitted via the Simon thread or via Signal.

**Real-time:** Subscribe to `agent_activity` via Supabase Realtime. New pending items appear at the top with a subtle slide-in animation.

**Empty state:** “No agent activity yet. Activity appears here once agents start running.” — appropriate for initial setup.

-----

## Brand Hub — `/brand`

Asset library for the BTS brand materials.

### Layout

Left sidebar filter (within the page, not the app sidebar): filter by `type` (logo / colour_palette / typography / tone_of_voice / style_guide / template / image / other) + active toggle.

Main area: card grid.

Each asset card:

- Asset name (DM Sans, weight 600)
- Type badge
- Description (truncated at 2 lines)
- If `file_url`: preview thumbnail (image) or file icon (non-image)
- If `content`: truncated text preview
- Active/inactive status (toggle switch on card)
- `...` menu: Edit, Download (if file), Delete

**Create/Edit asset** (slide-over):

Fields: Name, Type (select), Description, Content (textarea — for text assets like tone guides), File upload (for file assets), Active toggle.

-----

## Settings

### Team Members — `/settings/team`

Table of `team_members`:

|Column       |Content                        |
|-------------|-------------------------------|
|Name         |Full name                      |
|Role         |Role badge                     |
|Signal number|Masked display with copy button|
|Joined       |Date                           |
|Actions      |Edit                           |

Linked to `auth.users` — no create/delete here (manage via Supabase dashboard). Edit allows changing `full_name`, `role`, `signal_number`.

### Integrations — `/settings/integrations`

Status cards for each external integration:

- **Signal CLI** — status (connected / error), phone number registered, last heartbeat
- **Telnyx** — status, webhook endpoint URL (read-only, copy button)
- **Deepgram** — status, model in use (`nova-3`)
- **Supabase** — status, project ref (read-only)

Each card: integration name, logo icon, status badge (green/red/amber), key config values. No editing from here — these are managed via environment variables. Purely diagnostic.

-----

## Shared Patterns

### Modals

- Centred modal: medium tasks — create/edit simple entities, confirmations
- Slide-over (right): create/edit complex entities (contacts, tasks, content), detail views
- Both: `--color-surface` background, `12px` radius on modal, `--shadow-lg`, `--z-overlay`
- Backdrop: `rgba(26, 25, 21, 0.4)`, click to close (except confirmation dialogs)
- Escape key closes all modals
- Focus trap within open modal (accessibility)

### Confirmation Dialogs

For destructive operations only (delete, reject all). Centred modal, small.

- Title: “Delete [entity]?” (Playfair Display, H2 spec)
- Body: plain explanation of what will be lost
- Buttons: “Cancel” (secondary) + “Delete [entity]” (destructive) — destructive button on the right

Never auto-confirm destructive operations.

### Toast Notifications

- Position: bottom-right, stacked
- `--z-toast`, `--shadow-md`, `12px` radius
- Success: `--color-success` left border, `--color-surface` background
- Error: `--color-destructive` left border
- Info: `--color-accent` left border
- Auto-dismiss: 4 seconds for success/info, persistent for errors (manual dismiss)
- Message: short, specific — “Contact created” not “Success”

### Search

Global search is a future consideration. For now, each section has its own search input.

Section search inputs: in-page header area, DM Sans 14px, `--color-surface` background, `--color-border` border, `6px` radius. Filter in real-time (debounced 300ms).

### Loading States

- Initial page load: skeleton screens matching the layout of the actual content — same card/row structure, `--color-surface-subtle` placeholder blocks
- Mutation in progress (save, approve): button shows spinner + label changes (“Saving…”, “Approving…”) — button disabled during request
- Real-time updates: no loading state — updates appear as they arrive

### Pagination

- 25 rows per page for all list views
- Simple previous/next with “Page X of Y” — DM Sans, 13px, `--color-text-secondary`
- Jump to page input for long lists
- Total count displayed: “47 contacts” — DM Sans, 13px, `--color-text-tertiary`, in page header or above table

-----

## Data Fetching Conventions

Use Next.js App Router conventions throughout.

- **Server Components** for initial data fetch on page load — reduces client bundle, enables streaming
- **Client Components** for: real-time subscriptions, interactive forms, drag-and-drop, any component using `useState`
- **Server Actions** for mutations (create, update, delete) — avoids separate API route files
- **Optimistic updates** for status changes and simple field edits — update local state immediately, revert on error
- **Error boundaries** per section — an error in Tasks should not crash CRM

### Supabase client usage

Import from `@platform/db`. Use the server client for server components/actions; browser client for client components with real-time.

```typescript
// Server component
import { createServerClient } from '@platform/db'
// Client component (real-time)
import { createBrowserClient } from '@platform/db'
```

All types come from `@platform/db/src/types/database.ts`. Do not write raw SQL strings in `apps/web` — use the RPC wrappers in `packages/db/src/rpc/` for complex queries.

-----

## Key Component Inventory

Components to build, in suggested build order:

|Component            |Used in                      |Notes                                |
|---------------------|-----------------------------|-------------------------------------|
|`AppShell`           |All routes                   |Sidebar + page header wrapper        |
|`Sidebar`            |AppShell                     |Nav items, active states, badge      |
|`PageHeader`         |AppShell                     |Title + action slot                  |
|`AgentActivityCard`  |Simon, /activity             |The approval card — highest priority |
|`SimonThread`        |/simon                       |Thread + compose area                |
|`ContextPanel`       |/simon                       |Entity summary panel                 |
|`DataTable`          |CRM, Tasks                   |Sortable, paginated, with row actions|
|`SlideOver`          |Create/edit flows            |Right-side drawer                    |
|`Modal`              |Confirmations, simple creates|Centred                              |
|`PipelineChip`       |Contacts                     |Stage badge with colour per stage    |
|`PriorityChip`       |Tasks                        |Priority badge                       |
|`AgentBadge`         |Activity, Simon              |Agent name + icon, per-agent colour  |
|`InteractionTimeline`|Contact detail               |Chronological feed                   |
|`KanbanBoard`        |Tasks, Content               |Drag-and-drop columns                |
|`Toast`              |Global                       |Notification system                  |
|`SkeletonLoader`     |Loading states               |Matches page structure               |
|`ConfirmDialog`      |Delete flows                 |Destructive confirmation             |
|`ComboBox`           |Forms                        |Search + create inline               |
|`TagInput`           |Forms                        |Multi-value tag entry                |

Build `AgentActivityCard` and `SimonThread` first. They are the highest-value and most novel components — everything else is familiar territory.

-----

## Build Order Recommendation

1. **AppShell + Sidebar + PageHeader** — skeleton works for every route
1. **AgentActivityCard** — the core approval UI primitive; used in Simon and /activity
1. **SimonThread + Compose** — the platform’s standout feature
1. **Dashboard** — uses real data, validates that data fetching patterns work end-to-end
1. **/activity feed** — mostly re-uses AgentActivityCard
1. **DataTable + SlideOver + Modal** — shared primitives that unlock all CRUD views
1. **CRM (contacts + companies)** — highest-frequency CRUD
1. **Tasks** — second-highest frequency
1. **Projects** — lower frequency, simpler
1. **Content pipeline** — KanbanBoard component, rich editor
1. **Brand Hub** — simple asset library
1. **Settings** — mostly read-only display