# Phase 3: Go-To-Market (GTM) Optimisation - Feature Specification

## Overview

Phase 3 continues the product's evolution from discovery (Phase 1) and professional presence/testing (Phase 2) to refining the company's go-to-market strategy. The goal of this phase is to help the team find and nurture "Champions" within target accounts while ensuring that marketing content addresses real questions and pain points. It introduces a **Community Watchlist** to track where decision-makers gather, a **Champion Tracking system** to manage internal advocates and monitor job changes, and a **Content Validation filter** to prioritise content ideas that stem from repeated interview insights.

## Goals and Scope

### Goals

- **Identify target communities:** Maintain a live list of LinkedIn groups, professional associations and industry conferences where CFOs, HR leaders and other decision-makers congregate. This makes outreach more efficient and highlights relevant events for networking and advertising.
- **Nurture internal champions:** Extend the CRM to tag and monitor champions (internal advocates) at prospects and customers. This ensures that when champions change roles or organisations the team can protect existing deals, renewals and create new pipeline opportunities.
- **Validate content ideas:** Prevent content waste by filtering the insight pipeline. Ideas that do not address an interview question raised at least three times can be deprioritised. This helps the team focus on helpful, timely topics.

### Out of Scope

- Building full integrations with external job-change APIs (e.g., LinkedIn enrichment). The design allows for manual updates now and integration later.
- Automating paid advertising campaigns or event registration workflows.

## Data Model

This phase introduces new Supabase tables and extends existing ones. All tables follow Supabase best practices: lowercase names with underscores and primary keys using uuid or bigint identity.

### community_watchlist (new)

| Column            | Type                                 | Description                                                                                  |
| ----------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| id                | uuid (PK, default gen_random_uuid()) | Unique identifier.                                                                           |
| type              | text                                 | Type of community (e.g., linkedin_group, association, conference).                           |
| name              | text                                 | Name of the group, association or event.                                                     |
| url               | text                                 | URL for the LinkedIn group, association website or event landing page.                       |
| description       | text                                 | Summary of the community's focus.                                                            |
| role_tags         | text\[\]                             | Roles targeted (e.g., CFO, HR, CEO).                                                         |
| industry_tags     | text\[\]                             | Optional industry filters (e.g., law_firm, technology).                                      |
| membership_size   | integer                              | Approximate number of members or attendees. For conferences this can be expected attendance. |
| activity_level    | integer                              | Score 1-5 based on posting frequency or event cadence.                                       |
| location          | text                                 | City/region for conferences; online for virtual groups.                                      |
| start_date        | date                                 | Start date for conferences or events.                                                        |
| end_date          | date                                 | End date for conferences or events.                                                          |
| timezone          | text                                 | Timezone of the event (e.g., America/Chicago).                                               |
| engagement_status | text                                 | Status of our participation: not_joined, joined, attended, sponsor.                          |
| notes             | text                                 | Internal notes or insights.                                                                  |
| created_at        | timestamptz (default now())          | Record creation timestamp.                                                                   |
| updated_at        | timestamptz (default now())          | Updated timestamp via trigger.                                                               |

### champions (new)

Champions are contacts flagged as internal advocates. The table references the existing contacts table to avoid duplication.

| Column            | Type                                 | Description                                                                      |
| ----------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| id                | uuid (PK, default gen_random_uuid()) | Unique champion record.                                                          |
| contact_id        | uuid (FK to contacts.id)             | The contact designated as a champion.                                            |
| company_id        | uuid (FK to companies.id)            | Company where the champion currently works.                                      |
| role_type         | text                                 | Categorises influence: Champion (internal advocate), Economic Buyer, Influencer. |
| champion_score    | integer                              | Qualitative score (1-5) representing influence and advocacy strength.            |
| status            | text                                 | active, at_risk, departed.                                                       |
| last_contacted_at | timestamptz                          | Last time we interacted with the champion.                                       |
| notes             | text                                 | Additional observations or context.                                              |
| created_at        | timestamptz                          | Creation timestamp.                                                              |
| updated_at        | timestamptz                          | Last update timestamp.                                                           |

### champion_events (new)

An event log capturing significant changes related to champions (e.g., job change, departure, promotion). This table supports future automation with job-change signals.

| Column      | Type                      | Description                                              |
| ----------- | ------------------------- | -------------------------------------------------------- |
| id          | uuid (PK)                 | Unique identifier.                                       |
| champion_id | uuid (FK to champions.id) | The champion associated with this event.                 |
| event_type  | text                      | Examples: job_change, promotion, departure, note.        |
| event_date  | date                      | Date the event occurred.                                 |
| details     | text                      | Description of the event (e.g., new company, new title). |
| created_at  | timestamptz               | Timestamp when the event was logged.                     |

### Changes to insight_pipeline

To support content validation, the existing insight_pipeline table gains:

| Column         | Type                        | Description                                                                                               |
| -------------- | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| question_id    | uuid (FK to pain_points.id) | Links the idea to a specific interview question or pain point.                                            |
| question_count | integer                     | Number of times this question has been raised in interviews (derived from pain_points or interview_logs). |
| validated      | boolean                     | True when question_count ≥ 3; false otherwise. Managed by a trigger or computed column.                   |

The pain_points table introduced in Phase 1 already tracks the frequency of recurring problems. When a new idea is created, the system can look up the associated pain point and update question_count. A trigger on interview_logs or pain_points updates question_count and sets validated accordingly.

## API Endpoints (Mastra Agent Server)

Assuming the Mastra agent exposes REST endpoints, the following endpoints should be added:

### Community Watchlist

| Method | Endpoint            | Description                                                                                                       |
| ------ | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| GET    | /api/community      | Fetch list of communities with optional filters: type, role_tags, industry_tags, search, start_date, active_only. |
| POST   | /api/community      | Create a new community entry. Validates required fields (type, name).                                             |
| PATCH  | /api/community/{id} | Update community details, including engagement status or notes.                                                   |
| DELETE | /api/community/{id} | Soft-delete or archive a community entry (preserve history).                                                      |

### Champions

| Method | Endpoint                   | Description                                                                                                   |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET    | /api/champions             | List champions with filters: status, role_type, company_id, score_min, score_max.                             |
| POST   | /api/champions             | Create a new champion (requires contact_id, company_id, role_type). Marks the contact as champion in the CRM. |
| PATCH  | /api/champions/{id}        | Update champion fields (score, status, notes).                                                                |
| DELETE | /api/champions/{id}        | Remove champion designation (does not delete contact).                                                        |
| GET    | /api/champions/{id}/events | Retrieve the event history for a champion.                                                                    |
| POST   | /api/champions/{id}/events | Log a new event (e.g., job change). Accepts event_type, event_date, details. May trigger notifications.       |

### Content Validation

| Method | Endpoint                            | Description                                                                                |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| GET    | /api/insight-pipeline               | Returns pipeline items with optional query parameter validated=true/false to filter ideas. |
| PATCH  | /api/insight-pipeline/{id}          | Update question_id or override validated if manual override is allowed.                    |
| POST   | /api/insight-pipeline/{id}/validate | Explicitly validate or invalidate a content idea (admin only).                             |

### Internal Notifications

The agent should send notifications when:

- A champion's status changes to departed or at_risk (triggered via champion event).
- A new champion is added for an existing account.
- A community watchlist item changes engagement status to attended or sponsor.

Notification delivery can use existing channels (Slack, email) defined in Phase 1/Phase 2.

## Portal UI & Acceptance Criteria

### Community Watchlist Page

- **List & filtering:** A table or Kanban view of community entries. Users can filter by type (group/association/conference), role tags (CFO, HR), industry or event dates. Default sort by start_date for upcoming events and by activity level for groups.
- **Detail drawer:** Clicking an entry opens a drawer/modal with full details, including description, membership size, and notes. A link to the external URL opens in a new tab.
- **Add / edit forms:** Provide form components to add or edit communities. Required fields: name, type. For conferences, prompt for start_date and end_date. Autocomplete may suggest existing groups from LinkedIn. Include multi-select for role_tags and industry_tags.
- **Engagement status:** A drop-down to set our status (e.g., joined, attended). When set to attended or sponsor, prompt the user to add notes or attach relevant contacts.
- **Permissions:** Only users with the marketing_manager or admin role can create, update or delete communities. All authenticated users can view the watchlist. Row-level security ensures only active records are visible.
- **Acceptance criteria:**
- Given a user has permission, when they submit the add form with required fields, the system creates a new entry and displays it in the list.
- Filtering by role or type updates the list to show only matching communities.
- Editing an entry updates the record in the database and logs the change.
- Deleting sets a deleted_at timestamp and hides the record from default views.

### Champion Management Dashboard

- **Champion list:** A table summarising champions with columns: contact name, company, role type, score, status, last contacted. Colour-coded status (green for active, amber for at risk, red for departed).
- **Champion detail view:** Clicking a row opens a detail view with contact profile, notes, and event timeline. Provide quick actions to log an event or update the score.
- **Add champion:** A form to select a contact from the CRM and specify role_type, score and notes. If the contact already has a champion record, inform the user.
- **Event log:** Each event is displayed with date, type and details. Users can log new events; certain event types may trigger notifications.
- **Filtering & search:** Filters by status (active, at_risk, departed), role type, company or minimum score. Search by contact name or account.
- **Acceptance criteria:**
- When a user designates a contact as champion, the champion appears in the list and the contact's record reflects the champion role.
- Logging a job_change event with a future date triggers a notification to the account owner. The champion's status updates to at_risk or departed accordingly.
- The list can be filtered and sorted; the selected sort persists across sessions.

### Content Pipeline Validation

- **Validation indicator:** Add a column or badge to pipeline cards showing whether an idea is validated. For example, a green tick if validated=true or a warning icon if validated=false.
- **Filter/checkbox:** Provide a checkbox labelled "Hide unvalidated ideas." When checked, the board or list hides items where validated=false.
- **Link to pain point:** Each card displays its associated interview question or pain point. Clicking reveals the number of occurrences and a link to the detailed pain point record.
- **Manual override:** Users with marketing_manager role can override validation by toggling validated status. A note field records the reason (e.g., strategic priority).
- **Acceptance criteria:**
- When an idea is created and linked to a pain point, the system calculates question_count and sets validated accordingly.
- The "Hide unvalidated ideas" checkbox filters the view in real time.
- Overriding validation logs a note and updates the validated flag.

## Integration Considerations

- **CRM integration:** Champion records reference the existing contacts and companies tables. Use views to display champion information alongside contact and deal data.
- **Data enrichment:** While job-change detection via LinkedIn is out of scope, the schema and event log support future integration with enrichment APIs. When connected, events could be created automatically.
- **Notification service:** Leverage the existing notification framework from earlier phases. Create templates for champion departure alerts and new champion creation.
- **Security:** Implement row-level policies in Supabase to ensure only users belonging to appropriate roles can read or modify champions and watchlist data.

## Non-Functional Requirements

- **Performance:** Index role_tags, industry_tags, status and validated columns for efficient filtering. Use pagination for lists.
- **Data integrity:** Use database triggers to set updated_at and compute validated. Ensure referential integrity with foreign keys to contacts, companies, pain_points.
- **Accessibility:** Follow WCAG 2.1 guidelines in the portal. Provide keyboard navigation and screen reader support.
- **Audit trail:** Log changes to champions and community entries (created_by, updated_by). Provide audit views for admins.

## Implementation Roadmap

- **Database migration:** Create tables community_watchlist, champions, champion_events and alter insight_pipeline to add validation fields. Define indexes and triggers.
- **API layer:** Extend the Mastra server to expose CRUD endpoints with validation and permission checks. Integrate event logging and notifications.
- **Portal UI:** Develop React components (Next.js) for the watchlist page, champion dashboard and content validation UI. Implement filtering, modals and forms.
- **Notification templates:** Define message templates for champion departure and new champion events. Integrate with Slack/email as configured.
- **User roles & RLS policies:** Update Supabase and Mastra to support marketing_manager and admin roles with appropriate privileges.
- **Documentation & onboarding:** Update internal guides to explain champion definitions, watchlist purpose and content validation process. Provide training sessions for users.

## Risks and Mitigations

- **Data staleness:** Communities and champion statuses can become outdated without monitoring. Mitigation: schedule periodic reviews (e.g., quarterly) and assign owners for each watchlist entry.
- **Notification fatigue:** Over-alerting users on champion events may lead to ignored notifications. Mitigation: allow users to set preferences and severity thresholds; group multiple changes into one summary.
- **Over-filtering of content:** Rigidly enforcing the "three-times" rule may stifle creativity. Mitigation: allow manual overrides with justification and review the rule periodically based on content performance metrics.
- **Security considerations:** Champion data contains sensitive relationship information. Mitigation: enforce strict access controls, audit logs and encryption at rest.

## Footnotes (Sources)

- **Champion Tracking definition and importance:** The Lantern article on champion tracking explains that a champion is an internal advocate who believes in your solution, has organisational influence, sponsors deals and can navigate internal politics. It notes that champion tracking involves continuously monitoring job changes of key contacts to protect revenue, save pipeline and create new opportunities. The article emphasises that 30 % of B2B contacts change jobs annually, champions leaving mid-deal can stall deals, and former champions at new companies become warm leads (Lantern, 2026).
- **Finding quality LinkedIn groups:** Linked Helper's guide to LinkedIn groups recommends using keywords to search, reviewing active groups, exploring similar groups, checking which groups industry influencers belong to and using Sales Navigator to filter people by group membership. These steps help marketers find engaged communities and identify where decision-makers spend time (LinkedHelper, 2024-2026).
- **Value of conferences:** Vena Solutions' 2026 CFO conference roundup notes that conferences offer advice, best practices and networking with peers facing similar challenges. Attending the right events can provide new insights and help finance leaders expand their strategies (Vena Solutions, 2025).
- **Content marketing calendar best practices:** Pipedrive's content marketing calendar guide states that a robust calendar helps small teams plan content consistently, prioritise topics that support leads and revenue, and connect publishing decisions to business goals. The article also emphasises aligning content with buyer journey stages and using regular review and performance feedback to improve results (Pipedrive, 2026).
- **Helpful content and customer questions:** The B2B Playbook's 2026 strategy article argues that B2B content should focus on solving real jobs that buyers are trying to accomplish this week rather than generic awareness pieces. Helpful content shows people how to do their jobs today and naturally leads them to the product as a solution (B2B Playbook, 2026).