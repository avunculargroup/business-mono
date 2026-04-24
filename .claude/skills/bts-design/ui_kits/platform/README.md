# Platform UI Kit

High-fidelity recreation of the BTS internal platform (`apps/web` from `business-mono`). Reference these components when designing new screens for the platform.

## What's included

- **Sidebar.jsx** — fixed left nav with Work / System sections, collapsible on md
- **PageHeader.jsx** — sticky 64px header, Playfair title + action slot
- **Button.jsx** — primary / secondary / ghost / destructive, 28/36/40 px sizes
- **Card.jsx** — surface + border + 12px radius, optional hover lift
- **Input.jsx** — labelled field with helper + error states
- **StageChip.jsx** — pipeline stage (`lead / warm / active / client / dormant`)
- **DataTable.jsx** — sticky-header list with hover rows
- **EmptyState.jsx** — Lucide icon + contextual heading + CTA
- **AgentActivityCard.jsx** — the platform's signature surface

## Screens

- **Dashboard.jsx** — daily summary: pending approvals + open tasks
- **AgentActivity.jsx** — feed of Simon / specialist proposals awaiting review
- **ContactsList.jsx** — CRM contacts table with stage chips
- **ContactDetail.jsx** — single contact with interaction timeline

See `index.html` for the interactive click-through.

## Fidelity notes

These are cosmetic recreations — the components look right but don't wire to Supabase or the Mastra agent server. Data is mocked. Approval controls are non-destructive. Use this kit for designing and prototyping; use the real `apps/web` components in production.
