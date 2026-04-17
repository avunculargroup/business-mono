# Phase 1 Discovery Interview & CRM Enhancements

## Purpose

The business needs to conduct **15-20 discovery interviews** in the next few weeks to validate a hypothesised "bleeding‑neck" problem. To do this effectively we must move beyond a simple contacts/companies database and capture richer context about each interaction. This specification describes enhancements to our existing Supabase‑backed CRM and Next.js internal portal so the team can:

- Track outreach and interviews in one unified tracker rather than in separate spreadsheets.
- Tag stakeholders by their role (e.g., CFO, HR) to quickly identify which personas are most responsive. Postgres enum fields let us restrict a column to a predefined set of values, which simplifies queries and improves performance[\[1\]](https://supabase.com/docs/guides/database/postgres/enums#:~:text=).
- Record the specific **pain points** and "Why now?" trigger events discussed during calls. Needs‑based segmentation groups people according to a shared problem or need[\[2\]](https://medium.com/the-full-stack-researcher/the-ultimate-guide-to-needs-based-customer-segmentation-d6af302bde7#:~:text=What%20is%20Needs), so capturing pain points at the interview level enables us to prioritise segments later.
- Rank target markets or segments based on perceived need and ease of access using a simple **scorecard**. Competitive scorecards use weighted metrics (market awareness, ease of use, etc.) to rank competitors or opportunities[\[3\]](https://www.aha.io/roadmapping/guide/templates/competitor-analysis#:~:text=Competitor%20scorecard%20template); our scorecard will use similar scoring to evaluate which segments to prioritise.

These enhancements form the **Discovery Foundation** described in the brief and should be implemented immediately.

## Scope

The mono‑repo consists of:

- **Mastra agent server** - a backend service exposing various capabilities through API endpoints.
- **Next.js internal portal** - a web application for internal stakeholders.
- **Supabase** - PostgreSQL database with a default schema and existing contacts and companies tables.

This specification outlines database migrations, server APIs, and portal UI work required to achieve the discovery foundation. Phase 1 is limited to data capture and simple scoring; advanced analytics and automation will be addressed later.

## Guiding Principles

The descriptions in this document are **recommendations** rather than rigid requirements. Claude Code can adjust table names, API endpoints, or implementation details to align with existing patterns in the mono‑repository and to leverage built‑in abstractions. The focus is to capture structured discovery data quickly while preserving flexibility for future iterations and integration with existing services (including Fastmail).

## Existing Data Model

- contacts: stores contact details (name, email, phone, company_id, notes, etc.).
- companies: stores company details (name, website, industry, etc.).

No interview logs or segmentation fields currently exist. Contact roles are implied via text in notes.

## Proposed Data Model

All new tables and columns should be created in the public schema. Supabase migrations should be used to version control the changes. RLS policies must ensure only authenticated portal users can read/write data.

### Stakeholder Roles (Enum)

We need a fixed set of stakeholder roles (CFO, CEO, HR, Treasury, People Operations, etc.). Postgres enums are suitable when the list of values is small and unlikely to change; they improve query performance and simplify SQL[\[1\]](https://supabase.com/docs/guides/database/postgres/enums#:~:text=). Create an enum type stakeholder_role with values:

CREATE TYPE stakeholder_role AS ENUM ('CFO','CEO','HR','Treasury','PeopleOps','Other');

Add a column role stakeholder_role to the contacts table. Existing contacts can have NULL or Other if unknown. If the list of roles expands in the future, new values can be added using ALTER TYPE[\[4\]](https://supabase.com/docs/guides/database/postgres/enums#:~:text=To%20add%20new%20values%20to,how%20you%20can%20do%20it).

### Trigger Events (Enum)

The "Why now?" trigger describes external events prompting a prospect to explore our solution (e.g., **FASB accounting changes**, **employee BTC payment requests**, **regulatory updates**). Because triggers are few and defined up front, create an enum trigger_event_type with values such as 'FASB_CHANGE', 'EMPLOYEE_BTC_REQUEST', 'REGULATORY_UPDATE', 'OTHER'. This column will live on the discovery_interviews table (see below).

### Discovery Interviews Table

Create a discovery_interviews table to record each outreach or interview. Key fields include:

| Column          | Type                                            | Description                                                                                                                                                                                                                                                                                               |
| --------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id              | uuid primary key                                | Unique interview identifier.                                                                                                                                                                                                                                                                              |
| contact_id      | uuid references contacts(id) on delete cascade  | Person interviewed.                                                                                                                                                                                                                                                                                       |
| company_id      | uuid references companies(id) on delete cascade | Company associated (denormalised for faster access).                                                                                                                                                                                                                                                      |
| interview_date  | timestamp                                       | Date/time of the interview or planned call.                                                                                                                                                                                                                                                               |
| channel         | text                                            | How the interview was conducted (call, email, in‑person).                                                                                                                                                                                                                                                 |
| notes           | text                                            | Detailed notes summarising the conversation.                                                                                                                                                                                                                                                              |
| pain_points     | text\[\]                                        | Array of pain point summaries captured during the interview. Postgres arrays are supported in Supabase and can store multiple strings[\[5\]](https://supabase.com/docs/guides/database/arrays#:~:text=Working%20With%20Arrays). Each entry should be concise ("treasury risk," "talent retention," etc.). |
| trigger_event   | trigger_event_type                              | Enum capturing the "Why now?" context.                                                                                                                                                                                                                                                                    |
| created_at      | timestamp default now()                         | Row creation timestamp.                                                                                                                                                                                                                                                                                   |
| updated_at      | timestamp default now()                         | Updated via trigger on row update.                                                                                                                                                                                                                                                                        |
| email_thread_id | text                                            | Optional identifier linking this interview to a Fastmail thread or message for email outreach.                                                                                                                                                                                                            |

We use a text\[\] array for pain_points because interviews often surface multiple problems. Arrays are fully supported by Supabase and the JS client[\[6\]](https://supabase.com/docs/guides/database/arrays#:~:text=Working%20With%20Arrays).

### Pain Point Log (Audit Table)

To analyse the evolution of pain points over time, we need an audit trail that captures every insert or update to the pain_points array. Postgres triggers execute functions whenever a row is inserted, updated or deleted; they run in the same transaction and are ideal for creating audit logs[\[7\]](https://blog.sequinstream.com/all-the-ways-to-react-to-changes-in-supabase/#:~:text=Database%20triggers). Create a table pain_point_log with columns:

| Column       | Type               | Description                          |
| ------------ | ------------------ | ------------------------------------ |
| log_id       | bigint primary key | Serial identifier.                   |
| interview_id | uuid               | Foreign key to discovery_interviews. |
| pain_point   | text               | Single pain point captured.          |
| change_type  | text               | 'insert' or 'update'.                |
| changed_at   | timestamp          | Timestamp of the change.             |

Add an AFTER INSERT OR UPDATE trigger on discovery_interviews that iterates through the pain_points array and inserts a log entry for each element. A simplified PL/pgSQL function example:

CREATE OR REPLACE FUNCTION log_pain_points() RETURNS TRIGGER AS \$\$  
DECLARE  
pp text;  
BEGIN  
\-- Handle inserts and updates  
IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN  
FOREACH pp IN ARRAY NEW.pain_points LOOP  
INSERT INTO pain_point_log(interview_id, pain_point, change_type, changed_at)  
VALUES (NEW.id, pp, TG_OP::text, now());  
END LOOP;  
END IF;  
RETURN NEW;  
END;  
\$\$ LANGUAGE plpgsql;  
<br/>CREATE TRIGGER pain_points_audit  
AFTER INSERT OR UPDATE ON discovery_interviews  
FOR EACH ROW EXECUTE FUNCTION log_pain_points();

Triggers execute within the same transaction and ensure "exactly‑once" processing[\[8\]](https://blog.sequinstream.com/all-the-ways-to-react-to-changes-in-supabase/#:~:text=What%27s%20really%20neat%20about%20triggers,once%20processing). Be mindful that triggers can impact performance when large arrays are updated[\[9\]](https://blog.sequinstream.com/all-the-ways-to-react-to-changes-in-supabase/#:~:text=First%2C%20they%20can%20impact%20database,blunting%20the%20benefits%20of%20batching), but our dataset is small in Phase 1.

### Segment Scorecards Table

To rank markets (e.g., **Law Firms**, **Tech Start‑ups**) by need and accessibility, we need a lightweight scorecard table. Competitive scorecards allow you to evaluate attributes using weighted metrics to prioritise opportunities[\[3\]](https://www.aha.io/roadmapping/guide/templates/competitor-analysis#:~:text=Competitor%20scorecard%20template). Create segment_scorecards:

| Column       | Type               | Description                                                            |
| ------------ | ------------------ | ---------------------------------------------------------------------- |
| id           | bigint primary key | Identifier.                                                            |
| segment_name | text unique        | Name of the segment (e.g., "Law Firms").                               |
| need_score   | integer            | 1-5 rating representing how acute the pain is for this segment.        |
| access_score | integer            | 1-5 rating representing ease of reaching and interviewing the segment. |
| notes        | text               | Qualitative comments to justify scores.                                |
| created_at   | timestamp          | Timestamp.                                                             |
| updated_at   | timestamp          | Timestamp.                                                             |

Scores should be captured via the portal and can be updated as the team learns more. Later phases may add weighting or calculated fields.

## Mastra Agent Server Enhancements

The backend should expose REST or GraphQL endpoints to manage the new data. All endpoints must validate authentication and enforce RLS policies. Suggested endpoints (paths relative to existing API namespace):

### Interviews

- GET /interviews - Returns a paginated list of discovery interviews with joined contact and company data. Supports filters by date range, role, or trigger_event. Query parameters: contact_id, company_id, role, trigger_event, start_date, end_date.
- POST /interviews - Creates a new interview. Requires contact_id, interview_date, and optionally channel, notes, pain_points (array), and trigger_event.
- PATCH /interviews/{id} - Updates existing interview details. Must update updated_at automatically via SQL default or NOW().
- GET /interviews/{id} - Retrieves a specific interview along with pain point logs and contact details.

### Segment Scorecards

- GET /segments - Lists all segment scorecards.
- POST /segments - Creates a new segment with segment_name, need_score, access_score, and notes.
- PATCH /segments/{id} - Updates scores or notes.

### Supporting Endpoints

- GET /contacts?include=interviews - Returns contacts along with associated interviews, roles and companies.
- PATCH /contacts/{id} - Allows updating the role field on a contact.

Endpoints can be implemented in the mastra agent server using existing frameworks. They should leverage Supabase SDK/queries and handle errors gracefully. Use parameterised queries to avoid SQL injection.

## Next.js Portal Enhancements

### Unified Interview & CRM Tracker

Create a new **Interviews** section in the internal portal accessible from the side navigation. The page should:

- Display a table of upcoming and completed interviews with columns: Contact name, Company, Role, Interview date, Trigger event, Pain point summary (concatenated or count), and Next action.
- Provide filters for role and trigger_event (use dropdowns driven by enum values). Searching should be debounced to prevent unnecessary network calls.
- Allow inline editing of the interview date, channel and notes. Clicking a row opens a drawer or modal with full interview details and the ability to edit pain points (multi‑select chips) and notes.
- Offer a **New Interview** button. The form should allow selecting an existing contact (autocomplete), date/time picker, channel selection, and multi‑select pain points; capture a trigger_event from a dropdown. On submit, call POST /interviews via the agent server and update the table on success.

### Stakeholder Tags (Role)

Enhance the **Contacts** page:

- Add a Role column showing the contact's role (CFO, HR, etc.). For contacts with unknown roles, display "Unassigned" and highlight them for prioritised research.
- Provide an inline dropdown in each row to update the role. Changing the role triggers a PATCH /contacts/{id} request.
- In the contact profile view, show the role prominently and list all interviews associated with the contact.

### Problem‑Specific Logs & Pain Points

- Within the interview details modal, display an editable list of pain points as chips. Users can add new pain points via a free‑text field; each entry will be appended to the pain_points array.
- Show an **Audit** tab listing all pain point log entries pulled from pain_point_log (use GET /interviews/{id}). Include fields: pain point, change type, and changed_at. This trace helps track how the narrative evolved over multiple interactions.
- Provide an input for free‑text notes summarising the pain narrative; this goes to the notes field in discovery_interviews.

### Trigger Event Column

- Add a **Trigger Event** column to the interviews table with human‑friendly labels (e.g., "FASB change"). Provide a dropdown filter at the top of the table.
- When scheduling a new interview, require a trigger_event selection (with Other as fallback) and provide a text area to describe custom triggers when Other is selected.

### Segment Scorecards

Create a **Segments** page accessible from the navigation. This page should show a list of segment scorecards and allow editing.

- Display a table with columns: Segment, Need Score, Access Score, Weighted Score (need_score × access_score), and Notes. Weighted score is calculated client‑side for ranking.
- Provide inline editing of scores (range input or star rating). Save changes via PATCH /segments/{id}.
- Add a "New Segment" button to create a row via POST /segments.
- Show aggregated metrics such as average need score across all segments.
- Provide an ability to link segments to a target number of interviews (e.g., "plan 5 interviews for Law Firms"). This field can be added later; for now, include a planned_interviews integer column (default 0) in the table to anticipate future work.

## Integration Considerations

- **Authentication and RLS**: Ensure all operations require authentication. Configure Supabase Row‑Level Security so that only internal portal users can read/write these new tables.
- **Migrations**: Use the repository's existing migration framework to define the enum types, new tables and triggers. Provide up and down migrations for repeatability.
- **Supabase Client**: The Next.js portal uses the Supabase JS client. For operations that need to return updated rows (e.g., updates to interviews), chain .select() after .update() or .upsert() so that the updated records are returned. Supabase's update functions do not return rows by default; adding .select() fetches the updated data (as documented in the Supabase JS reference, though the docs may require dynamic loading).
- **Performance**: Triggers and array updates can impact performance on large datasets[\[9\]](https://blog.sequinstream.com/all-the-ways-to-react-to-changes-in-supabase/#:~:text=First%2C%20they%20can%20impact%20database,blunting%20the%20benefits%20of%20batching), but Phase 1 expects fewer than 50 interviews. Monitor query times and refactor if necessary.
- **Testing**: Write unit tests for the mastra agent endpoints and integration tests for the portal flows. Include test data for contacts, companies and interviews. Validate that audit logs are created when pain points are updated.
- **Fastmail integration**: The organisation already has integration with Fastmail for email communications. Where possible, reuse this integration to send interview invitations and follow‑ups and to link email threads back to interviews. The optional email_thread_id field on discovery_interviews can store a Fastmail thread or message identifier so that future automation can fetch or display conversation history. Implementation details (such as how to call Fastmail APIs) are left to Claude Code and should leverage existing modules in the mono‑repo.

## Acceptance Criteria

For Phase 1 to be considered complete, the following criteria must be met:

- **Database schema** reflects the new tables, enums and triggers. Migration scripts are versioned and tested.
- **Mastra agent** exposes the endpoints described above and passes integration tests (CRUD operations for interviews, scorecards, contacts).
- **Next.js portal** includes the new **Interviews** and **Segments** pages. Contacts page displays and updates stakeholder roles.
- **Pain point logs** are automatically created whenever a discovery interview's pain_points array is inserted or updated. Audit logs show correct entries and timestamps.
- **Trigger events** are captured on every interview record. Filtering by trigger_event and role works correctly on the portal.
- **Segment scorecards** can be created, edited and ranked. Weighted scores are calculated on the client and displayed in the UI.
- The team can schedule new interviews, capture pain points and trigger events, tag stakeholders, and view a scorecard ranking of segments without leaving the internal portal.
- Optionally, interviews can be linked to Fastmail email threads using the email_thread_id field. If implemented, users should be able to open the corresponding email thread from the portal; however this integration is not mandatory for Phase 1.

## Future Enhancements (Out of Scope for Phase 1)

- **Automated reminders** for scheduled interviews via email/slack integration.
- **Reporting dashboards** summarising pain point frequency, average scores per segment and interview status.
- **Integration with external calendaring systems** (e.g., Google Calendar) for scheduling.
- **Machine learning** to suggest pain points from interview transcripts.

Phase 1 lays the foundation for these future features by ensuring we capture structured data early.

[\[1\]](https://supabase.com/docs/guides/database/postgres/enums#:~:text=) [\[4\]](https://supabase.com/docs/guides/database/postgres/enums#:~:text=To%20add%20new%20values%20to,how%20you%20can%20do%20it) Managing Enums in Postgres | Supabase Docs

<https://supabase.com/docs/guides/database/postgres/enums>

[\[2\]](https://medium.com/the-full-stack-researcher/the-ultimate-guide-to-needs-based-customer-segmentation-d6af302bde7#:~:text=What%20is%20Needs) The Ultimate Guide to Needs-Based Customer Segmentation | by Daniel Kyne | The Full-Stack Researcher | Medium

<https://medium.com/the-full-stack-researcher/the-ultimate-guide-to-needs-based-customer-segmentation-d6af302bde7>

[\[3\]](https://www.aha.io/roadmapping/guide/templates/competitor-analysis#:~:text=Competitor%20scorecard%20template) Competitive Analysis Templates: Options for Product Teams

<https://www.aha.io/roadmapping/guide/templates/competitor-analysis>

[\[5\]](https://supabase.com/docs/guides/database/arrays#:~:text=Working%20With%20Arrays) [\[6\]](https://supabase.com/docs/guides/database/arrays#:~:text=Working%20With%20Arrays) Working With Arrays | Supabase Docs

<https://supabase.com/docs/guides/database/arrays>

[\[7\]](https://blog.sequinstream.com/all-the-ways-to-react-to-changes-in-supabase/#:~:text=Database%20triggers) [\[8\]](https://blog.sequinstream.com/all-the-ways-to-react-to-changes-in-supabase/#:~:text=What%27s%20really%20neat%20about%20triggers,once%20processing) [\[9\]](https://blog.sequinstream.com/all-the-ways-to-react-to-changes-in-supabase/#:~:text=First%2C%20they%20can%20impact%20database,blunting%20the%20benefits%20of%20batching) All the ways to react to changes in Supabase

<https://blog.sequinstream.com/all-the-ways-to-react-to-changes-in-supabase/>