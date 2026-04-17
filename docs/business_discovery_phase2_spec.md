# Phase 2 Feature Specification - Professional Presence & Testing

## Purpose

Phase 2 builds on the discovery tooling delivered in Phase 1 by adding assets and workflows that help the company project a professional brand, turn manual MVP experiments into reusable artifacts, capture feedback, and translate customer pain points into content. These features are considered **secondary priority** (to be implemented once the Phase 1 CRM foundation is live) but are essential for demonstrating competence and learning quickly from early‑stage market tests.

The new capabilities described here will be implemented across two existing components of the mono‑repository:

- **Mastra agent server** - A TypeScript/Node service that exposes APIs and LLM‑powered utilities. New endpoints will store and retrieve lexicon entries, templates, feedback and content ideas, and optionally call internal agents to generate documents or summarise feedback.
- **Next.js internal portal** - A React/Next.js web application used by internal staff. New pages and components will allow users to create, edit and manage the lexicon, MVP templates, feedback repository and insight pipeline. The portal already integrates with Supabase via the JavaScript SDK for data persistence.

All data created in Phase 2 will be stored in Supabase (PostgreSQL). Table names should follow Supabase naming conventions (lowercase with underscores) and each table must have a primary key (preferably uuid or identity). Row‑level security (RLS) must be enabled, and policies defined to ensure only authorised users can insert, update or read sensitive data.

## Background & Research

### Why a corporate lexicon guide?

A multilingual style guide or lexicon ensures that everyone communicating on behalf of the company uses consistent language, tone, and terminology. According to translation experts, a style guide defines the voice and tone of a brand, provides rules for grammar and punctuation, and ensures that content creators and translators convey a unified message across markets. A well‑maintained style guide improves decision‑making and prevents random writing styles that could damage the company's image. The guide should include guidance on language, target audience, tone of voice, cultural considerations and formatting, and must be reviewed periodically to reflect evolving style and market trends.

### Why an MVP template library?

Single‑page "one‑pagers" and concise briefing decks provide quick, professional deliverables for prospects. A sales one‑pager distills a longer pitch into a single page and should remind readers of key pain points, present a few compelling features addressing those pains and include a clear call‑to‑action. A one‑pager must focus on the buyer persona, state the value proposition, provide social proof, and include next steps. A product one‑pager should clearly state the problem, proposed solution, expected impact (with quantifiable metrics), required effort and risks, all on a single page. Briefing decks of roughly 45 minutes typically follow a rule of thumb of **one slide per minute**; presenters adjust the slide count depending on content density and speaking style. The template library should therefore standardise content structure and design for both one‑pagers and 45‑minute decks, making it easy for team members to tailor them for different prospects.

### Why a feedback repository?

Product teams gain valuable insights by centralising customer feedback. A systematic feedback collection strategy starts by identifying all channels (emails, surveys, social media), actively encouraging feedback, and storing it in a central repository. Each piece of feedback should follow a standard format (date, source, category, description) and be tagged for searchability. A central repository enables teams to prioritise feedback, track severity and impact, and regularly audit the data for accuracy.

### Why an insight pipeline?

Creating an editorial pipeline helps convert ideas into published content without bottlenecks. Todoist's content pipeline template captures ideas at the top, moves them to a committed pipeline, tracks posts in progress, and marks them ready to publish or posted. In addition, Monday.com identifies key components of effective content management templates: clearly defined workflow stages, role assignments, timelines, quality checkpoints, asset organisation, and performance tracking. Our insight pipeline should therefore provide stages for LinkedIn content ideas (Idea → Committed → In Progress → Ready to Publish → Posted), assign owners, include deadlines, track pain points from discovery interviews, and allow tagging and scoring.

## High‑Level Scope

The following features will be implemented in Phase 2. Phase 1 features (interview tracking, segment scorecards, etc.) are already live and will not be duplicated here.

- **Corporate Lexicon Guide** - A searchable glossary of approved terms and phrases with definitions and professional equivalents. Includes versioning, tagging by category, and integration with LLM agents for auto‑suggestions.
- **MVP Template Library** - A repository of reusable one‑pager outlines and 45‑minute briefing deck templates. Users can browse, preview, copy and customise templates for prospects.
- **Feedback Repository** - A central database for storing unfiltered feedback and testimonials from MVP tests, linked to contacts/companies and pain points. Supports tagging, severity rating, and sentiment analysis.
- **Insight Pipeline** - A Kanban‑style board to track LinkedIn content ideas mapped to pain points discovered in Phase 1. Tracks each idea through defined stages, deadlines and assigned owners.

## Functional Requirements

### 1 Corporate Lexicon Guide

#### 1.1 Description

Provide a shared lexicon that translates internal "moon" terminology into professional, customer‑friendly language. The lexicon will help ensure consistent messaging across all internal and external communications.

#### 1.2 Data Model (Supabase)

Create a new table corporate_lexicon with the following fields:

| Column            | Type                     | Constraints & Description                                             |
| ----------------- | ------------------------ | --------------------------------------------------------------------- |
| id                | uuid                     | Primary key (auto‑generated).                                         |
| term              | text                     | The internal or informal term (e.g., "Moon").                         |
| professional_term | text                     | The approved professional equivalent (e.g., "programmable scarcity"). |
| definition        | text                     | A concise definition of the term.                                     |
| category          | text                     | Category or department (e.g., Finance, Operations).                   |
| example_usage     | text                     | Example sentence(s) demonstrating usage.                              |
| status            | text                     | Enum: draft, approved, deprecated.                                    |
| version           | integer                  | Version number for the term (increments on update).                   |
| created_by        | uuid                     | FK → users.id.                                                        |
| approved_by       | uuid                     | FK → users.id (optional).                                             |
| created_at        | timestamp with time zone | Default now().                                                        |
| updated_at        | timestamp with time zone | Default now() on update.                                              |

_Naming guidelines:_ Table names and columns follow the convention of lowercase letters and underscores. Each table includes a primary key using a uuid type.

#### 1.3 API Endpoints (Mastra Server)

GET /lexicon - Returns a paginated list of lexicon terms. Supports filters: status, category, search (full‑text search on term and professional_term).

GET /lexicon/{id} - Returns a single lexicon entry with history and example usage.

POST /lexicon - Creates a new lexicon entry. Requires authentication and the editor role.

PUT /lexicon/{id} - Updates an existing entry (increments version). Requires editor role. Optionally triggers an LLM to suggest improvements or synonyms.

POST /lexicon/{id}/approve - Marks the entry as approved and sets approved_by. Requires admin or language_owner role.

DELETE /lexicon/{id} - Soft‑deletes an entry by marking status as deprecated. Only admin can perform this action.

#### 1.4 Portal UI & Acceptance

Provide a single Lexicon page that lists all terms with search/filter controls. Clicking a term opens a modal for editing. Users with the editor role can create and edit entries; language_owner can approve or deprecate them. The form should suggest professional equivalents via an internal LLM and display version history. The lexicon must implement full‑text search, filtering by category/status, and maintain version increments. RLS ensures only authorised users can view or modify entries.

### 2 MVP Template Library

#### 2.1 Description

Create a library of reusable templates that sales and product teams can quickly customise to deliver manual MVPs. Two template types are required:

- **One‑pager template** - A single‑page outline summarising the problem, solution, impact (with quantifiable metrics), required effort and risks. It should remind the reader of key pain points, present a few compelling features addressing those pains and include a clear call‑to‑action. The one‑pager must fit on one page when printed or on a single screen, forcing clarity and brevity.
- **Briefing deck template** - A 45‑minute presentation deck. A general guideline is one slide per minute, but the deck should be modular so slides can be added or removed based on content density. The template should contain sections for problem/pain points, proposed solution, benefits, proof of competence (e.g., testimonials or pilot results), implementation plan and call‑to‑action. Each slide should emphasise visuals over text and follow corporate design guidelines.

#### 2.2 Data Model (Supabase)

Create a table mvp_templates and an associated table mvp_template_versions to support versioning and draft/approved states.

| Column      | Type                     | Description                                      |
| ----------- | ------------------------ | ------------------------------------------------ |
| id          | uuid                     | Primary key for the template.                    |
| type        | text                     | Enum: one_pager, briefing_deck.                  |
| title       | text                     | Template name (e.g., "Treasury Risk One‑Pager"). |
| description | text                     | Short description of the template's purpose.     |
| tags        | text\[\]                 | Array of tags (e.g., "finance", "compliance").   |
| created_by  | uuid                     | FK → users.id.                                   |
| created_at  | timestamp with time zone | Default now().                                   |
| updated_at  | timestamp with time zone | Default now().                                   |

mvp_template_versions contains the actual template content:

| Column         | Type                     | Description                                            |
| -------------- | ------------------------ | ------------------------------------------------------ |
| id             | uuid                     | Primary key.                                           |
| template_id    | uuid                     | FK → mvp_templates.id.                                 |
| version_number | integer                  | Version number.                                        |
| status         | text                     | Enum: draft, approved, deprecated.                     |
| content        | jsonb                    | JSON representation of template (layout and markdown). |
| created_by     | uuid                     | FK → users.id.                                         |
| created_at     | timestamp with time zone | Default now().                                         |
| approved_by    | uuid                     | FK → users.id (optional).                              |

#### 2.3 API Endpoints (Mastra Server)

GET /templates - Returns list of templates with metadata and the latest approved version. Supports filters by type and tags.

GET /templates/{id} - Returns a template with all versions.

POST /templates - Creates a new template with an initial draft version. Requires template_editor role.

PUT /templates/{id} - Updates template metadata (title, description, tags). Does not modify content.

POST /templates/{id}/versions - Creates a new draft version for the template. The request body includes JSON content of the template and any comments. Returns the new version number.

POST /templates/{id}/versions/{version}/approve - Marks the version as approved. Only one version per template can be approved at a time.

DELETE /templates/{id}/versions/{version} - Soft‑delete the version (mark as deprecated).

#### 2.4 Portal UI & Acceptance

A consolidated Template Library page lists all templates with filters by type and tags. Users can create new templates, duplicate existing ones, and view version history. One‑pager templates are edited in a Markdown form pre‑populated with standard sections; briefing decks use a simple slide builder with placeholders and guidance. Export actions produce PDF or PPTX via the agent. Only users with the template_editor role can edit templates and only one version per template can be approved. The editor must enforce the single‑page constraint for one‑pagers and include key sections for decks. All edits and approvals are audited.

### 3 Feedback Repository

#### 3.1 Description

Build a central repository to collect unfiltered feedback and testimonials from initial MVP tests. The repository should enable teams to capture feedback across channels, categorise it, link it to contacts/companies and pain points, and analyse trends. According to product management best practices, centralising feedback with standardised fields and tagging facilitates prioritisation and analysis.

#### 3.2 Data Model (Supabase)

Create a table feedback with the following fields:

| Column        | Type                     | Description                                                       |
| ------------- | ------------------------ | ----------------------------------------------------------------- |
| id            | uuid                     | Primary key.                                                      |
| contact_id    | uuid                     | FK → contacts.id from the existing CRM.                           |
| company_id    | uuid                     | FK → companies.id (optional).                                     |
| pain_point_id | uuid                     | FK → pain_points.id (from Phase 1).                               |
| source        | text                     | Source of feedback (e.g., interview, survey, email, testimonial). |
| date_received | date                     | Date when feedback was captured.                                  |
| category      | text                     | Category (bug report, feature request, usability, testimonial).   |
| rating        | integer                  | Optional numeric rating (e.g., 1-5).                              |
| description   | text                     | Detailed feedback message.                                        |
| tags          | text\[\]                 | Array of tags for searchability.                                  |
| sentiment     | jsonb                    | JSON storing sentiment analysis results (score, magnitude).       |
| created_by    | uuid                     | FK → users.id.                                                    |
| created_at    | timestamp with time zone | Default now().                                                    |
| updated_at    | timestamp with time zone | Default now().                                                    |

Add indexes on date_received, pain_point_id and tags for efficient filtering.

#### 3.3 API Endpoints (Mastra Server)

GET /feedback - Returns paginated feedback entries with optional filters: contact_id, company_id, pain_point_id, category, tags, search (full‑text search on description). Supports sorting by date or rating.

GET /feedback/{id} - Returns a single feedback entry with associated contact/company details and pain point.

POST /feedback - Creates a new feedback entry. Performs basic sentiment analysis via an internal agent (e.g., calls an LLM to obtain sentiment). Requires authentication.

PUT /feedback/{id} - Updates an existing entry (only the creator or feedback_owner can edit). Allows updating tags, category, rating and description.

DELETE /feedback/{id} - Soft‑deletes the entry by setting a deleted_at timestamp. Only admin can delete feedback.

#### 3.4 Portal UI & Acceptance

Provide a unified Feedback page with a table of entries, filters (date range, category, tags, pain point) and a search box. Clicking an entry opens a modal with full details, sentiment analysis and related contacts/companies. A form allows adding new feedback, including source, category, rating and tags; sentiment is automatically analysed. Export actions output CSV reports. The repository must enforce RLS policies, ensure referential integrity with the CRM, support full‑text search and filtering, and allow testimonials to be reused in templates.

### 4 Insight Pipeline (LinkedIn Content Ideas)

#### 4.1 Description

Create a Kanban‑style board that tracks LinkedIn content ideas derived from discovery interview pain points. Each idea moves through a pipeline from ideation to publication. The board should implement a structured workflow with clearly defined stages, role assignments and timelines, as recommended by content management best practices. It should also capture research and links for each idea and map them to the corresponding pain point.

#### 4.2 Data Model (Supabase)

Create table insight_pipeline with the following fields:

| Column        | Type                     | Description                                                       |
| ------------- | ------------------------ | ----------------------------------------------------------------- |
| id            | uuid                     | Primary key.                                                      |
| title         | text                     | Title of the content idea.                                        |
| description   | text                     | Detailed description or outline of the content idea.              |
| pain_point_id | uuid                     | FK → pain_points.id, linking the idea to a discovered pain point. |
| stage         | text                     | Enum: idea, committed, in_progress, ready_to_publish, posted.     |
| due_date      | date                     | Suggested date to publish.                                        |
| owner_id      | uuid                     | FK → users.id representing the content owner.                     |
| score         | integer                  | Optional numeric score (e.g., priority or impact).                |
| tags          | text\[\]                 | Tags (e.g., "treasury risk", "employee retention").               |
| links         | jsonb                    | JSON array of research links (blog posts, studies, etc.).         |
| created_by    | uuid                     | FK → users.id.                                                    |
| created_at    | timestamp with time zone | Default now().                                                    |
| updated_at    | timestamp with time zone | Default now().                                                    |

Add index on stage and pain_point_id. Consider an additional table insight_comments for comments and collaboration if collaborative editing is needed.

#### 4.3 API Endpoints (Mastra Server)

GET /pipeline - Returns all pipeline items. Supports filters by stage, pain point, owner and tags. Supports sorting by due date or score.

GET /pipeline/{id} - Returns a single pipeline item with all details.

POST /pipeline - Creates a new pipeline item. Requires content_creator role. Performs basic content classification to suggest tags or scores (optional internal agent call).

PUT /pipeline/{id} - Updates an existing item (title, description, pain point, stage, due date, owner, score, tags, links). Only the owner or pipeline_admin can edit.

DELETE /pipeline/{id} - Soft‑deletes the item. Only pipeline_admin can delete.

#### 4.4 Portal UI & Acceptance

Use a Kanban board to visualise the pipeline stages (Ideas → Committed → In Progress → Ready to Publish → Posted). Cards display basic info (title, owner, due date, tags) and can be dragged between columns. A modal allows creating or editing an idea, including pain point, due date, research links and tags; suggestions are provided via an agent. Filters for pain point, owner, dates and tags, plus full‑text search, update the board dynamically. Users only see items they have access to; owners or admins can edit. Notifications should remind users of approaching due dates and stage transitions. Stage changes update the database field and maintain a history.

## Integration with Existing CRM

Phase 2 features must integrate with the rudimentary CRM implemented in Phase 1. Specifically:

- **Feedback** - feedback.contact_id refers to contacts.id and feedback.company_id refers to companies.id. When a contact or company is deleted, cascade delete should either soft‑delete related feedback or set references to null. Use ON DELETE SET NULL for optional relationships.
- **Pain Points** - feedback.pain_point_id and insight_pipeline.pain_point_id refer to the pain_points table created in Phase 1. If a pain point is removed, these references should be set to null or re‑mapped.
- **Users & Roles** - The existing authentication mechanism should support roles such as editor, template_editor, language_owner, feedback_owner, content_creator, pipeline_admin and admin. Use row‑level security (RLS) policies to restrict data access based on roles and relationships.

## Non‑Functional Requirements

Ensure robust **security** (authenticated endpoints, RLS), adequate **performance** (pagination, indexes, full‑text search), **consistency** (transactional updates and clear versioning), **auditability** (logging and version history) and **accessibility** (responsive design, keyboard support, semantic HTML). Use caching where appropriate and enforce rate limits on API calls.

## Implementation Plan (summary)

Implementation should follow a typical agile flow:

- **Planning & Design** - Finalise data models, API contracts and user flows. Gather stakeholder feedback on lexicon categories, template structures and pipeline stages.
- **Database Migration & API** - Add new Supabase tables, indexes and RLS policies; implement API endpoints with validation and authentication; write tests.
- **Portal UI Development** - Build pages and components for each feature (lexicon, templates, feedback, pipeline). Implement drag‑and‑drop for the pipeline board and ensure responsive design and accessibility.
- **Testing & Launch** - Conduct functional and usability testing, then deploy to staging and production. Provide training and documentation to internal users. Schedule periodic reviews and collect usage metrics to drive continuous improvements.

## Risks & Mitigations

- **Adoption** - Teams may not use the lexicon or templates, leading to inconsistent messaging. Mitigate via training sessions, embedding lexicon search in the portal, and making templates the default starting point for pitches.
- **Data privacy** - Feedback may contain sensitive information. Enforce strict RLS policies and allow authors to mark entries confidential. Restrict testimonial visibility to approved roles.
- **Complexity** - Overly complex templates or pipelines may discourage usage. Start with minimal structures and iterate based on user feedback.
- **Stale content** - Lexicon and templates can become outdated. Schedule periodic reviews and versioning. Assign owners responsible for updates.
- **CRM integration** - Broken foreign keys can lead to orphaned records. Use foreign key constraints with ON DELETE SET NULL and test migrations thoroughly.

## Appendix: Example One‑Pager Outline

This outline uses research‑based guidelines to structure the one‑pager:

- **Header** - Title, author, date and status.
- **Problem Statement** - Describe the customer pain point; include one data point as evidence.
- **Proposed Solution** - High‑level description of the product or service addressing the pain; limit to 2-3 sentences.
- **Impact & Metrics** - Quantify expected impact with numbers (e.g., reduce churn by X%, save Y hours).
- **Effort & Timeline** - Estimate engineering/design effort and timeline; list dependencies and risks.
- **Proof & Social Evidence** - Include customer quotes or testimonials; link to the feedback repository for validation.
- **Call to Action** - Define the ask (e.g., schedule meeting, approve for roadmap); ensure clear next steps.

## Appendix: Pipeline Board Stages

The content pipeline follows the template described by Todoist and Monday.com:

- **Content Ideas** - Capture raw ideas. Add description and research links. Decide whether to move into the pipeline.
- **Committed** - Approved ideas that will be produced. Assign owner and due date. Refine idea in comments.
- **In Progress** - Content is being drafted. Monitor deadlines and coordinate with design/marketing.
- **Ready to Publish** - Draft is complete and under final review. Upload it to your blog or scheduling tool.
- **Posted** - Content has been published. Track performance metrics if possible.