# Ecosystem pages

Reference for the **Ecosystem** section of the web app: `/products` and
`/products/[id]` (Products & services) and `/advisors` and `/advisors/[id]`
(Advisors & partners). This documents the **current state** of the UI and the
server actions behind it.

These are human-maintained reference registers, not agent-driven surfaces. No
agent in `apps/agents` reads or writes `products_services`, `advisors_partners`,
or any of their child tables — everything on these pages is entered by a
director through the UI. The only agent-adjacent data on screen is the
interaction history, which is read from `interactions` (populated by Della via
the Fastmail sync and by Recorder from calls/meetings).

There is **no `/ecosystem` route**. "Ecosystem" is a sidebar grouping only: the
parent nav item links to its first child (`/products`), and
`Sidebar.tsx`'s `isActive` treats `/ecosystem` as active when the pathname
starts with `/products` or `/advisors`.

Both trees follow the same shape — a server component that fetches, a client
component that owns all interaction — and are near-mirrors of each other.
Products has one section advisors doesn't (referral agreements); advisors has
richer profile fields (bio, website, LinkedIn, engagement model).

## File map

| File | Role |
|------|------|
| `apps/web/app/(app)/products/page.tsx` | Route entry. `PageHeader` + `Suspense` around `ProductsContent`. |
| `apps/web/app/(app)/products/ProductsContent.tsx` | Server component. Fetches the product list + form picklists, renders `ProductsView`. |
| `apps/web/app/(app)/products/loading.tsx` | `PageSkeleton variant="cards"`. |
| `apps/web/app/(app)/products/products.module.css` | List styles (card grid, empty state). |
| `apps/web/app/(app)/products/[id]/page.tsx` | Server component for one product. Resolves id-or-slug, fetches the row + children + interactions. |
| `apps/web/app/(app)/products/[id]/loading.tsx` | `PageSkeleton variant="detail"`. |
| `apps/web/app/(app)/products/[id]/product-detail.module.css` | Detail styles (35/65 split, sidebar fields, section cards). |
| `apps/web/components/products/ProductsView.tsx` | Client. Card grid, "Add product" slide-over, optimistic insert. |
| `apps/web/components/products/ProductDetail.tsx` | Client. Overview sidebar, key contacts, referral agreements, interaction history, edit/delete. |
| `apps/web/components/products/ProductForm.tsx` | Create form (`useEntityForm`, `FormField`/`FormSelect` kit). |
| `apps/web/components/products/ProductEditForm.tsx` | Edit form (`useActionState`, raw `ContactForm.module.css` inputs). |
| `apps/web/components/products/ProductKeyContactForm.tsx` | Attach an existing contact with a role. |
| `apps/web/components/products/ProductReferralAgreementForm.tsx` | Add a referral agreement. |
| `apps/web/app/actions/products.ts` | Server actions for products, key contacts, referral agreements. |
| `apps/web/app/(app)/advisors/page.tsx` | Route entry. `PageHeader` + `Suspense` around `AdvisorsContent`. |
| `apps/web/app/(app)/advisors/AdvisorsContent.tsx` | Server component. Fetches the advisor list + picklists, renders `AdvisorsView`. |
| `apps/web/app/(app)/advisors/loading.tsx` | `PageSkeleton variant="cards"`. |
| `apps/web/app/(app)/advisors/advisors.module.css` | List styles (same grid as products). |
| `apps/web/app/(app)/advisors/[id]/page.tsx` | Server component for one advisor/partner. |
| `apps/web/app/(app)/advisors/[id]/loading.tsx` | `PageSkeleton variant="detail"`. |
| `apps/web/app/(app)/advisors/[id]/advisor-detail.module.css` | Detail styles. |
| `apps/web/components/advisors/AdvisorsView.tsx` | Client. Card grid, "Add advisor" slide-over, optimistic insert. |
| `apps/web/components/advisors/AdvisorDetail.tsx` | Client. Overview sidebar, key contacts, interaction history, edit/delete. |
| `apps/web/components/advisors/AdvisorForm.tsx` | Create form. |
| `apps/web/components/advisors/AdvisorEditForm.tsx` | Edit form. |
| `apps/web/components/advisors/AdvisorContactForm.tsx` | Attach an existing contact with a free-text role. |
| `apps/web/app/actions/advisors.ts` | Server actions for advisors/partners and their contacts. |
| `apps/web/lib/referenceData.ts` | `getCompanyOptions` / `getTeamMemberOptions` — the shared picklist fetchers both trees use. |
| `apps/web/lib/utils.ts` | `idColumn` (uuid-vs-slug), `getInitials`, `formatDate`. |
| `supabase/migrations/20260427000000_add_products_and_advisors.sql` | Tables, indexes, RLS. |
| `supabase/migrations/20260716020000_add_human_friendly_slugs.sql` | `slug` column + insert trigger for both tables. |

## Data model

Five tables, all created in `20260427000000_add_products_and_advisors`. RLS is
the platform default: a single `*_all` policy granting authenticated users full
access.

### `products_services`

| Column | Notes |
|--------|-------|
| `id` | UUID PK. All FKs and `agent_activity` references point here. |
| `slug` | Human-facing URL handle. Generated once on INSERT, never regenerated. |
| `name` | Required. |
| `business_name` | Legal/trading name behind the product. |
| `category` | CHECK: `custody`, `exchange`, `wallet_software`, `wallet_hardware`, `payment_processing`, `treasury_management`, `education`, `consulting`, `insurance`, `lending`, `other`. |
| `australian_owned` | Boolean, default false. Surfaces as an "AU owned" chip. |
| `description`, `logo_url`, `product_image_url` | Free text / URLs. |
| `company_id` | → `companies`, `ON DELETE SET NULL`. |
| `key_relationship_id` | → `team_members` — which director owns this relationship. |
| `created_by` | → `team_members`. Written on create only. |

Children: `product_referral_agreements` (`agreement_type` CHECK
`referral_fee` / `revenue_share` / `affiliate` / `strategic` / `other`,
`counterparty_name`, `fee_structure`, `percentage NUMERIC(5,2)`, `active`,
`notes`) and `product_key_contacts` (junction to `contacts`, `role` CHECK
`primary` / `technical` / `sales` / `support` / `other`, unique per
product+contact). Both cascade on product delete.

### `advisors_partners`

| Column | Notes |
|--------|-------|
| `id`, `slug` | As above. |
| `name` | Required. |
| `type` | Required. CHECK `advisor` / `partner`. |
| `specialization` | Free text, shown on the card. |
| `engagement_model` | CHECK: `ongoing_retainer`, `project_based`, `ad_hoc`, `revenue_share`, `honorary`. |
| `rate_notes`, `bio` | Free text. |
| `logo_url`, `website`, `linkedin_url` | URLs. |
| `company_id`, `key_relationship_id`, `created_by` | Same FK pattern as products. |
| `active` | Boolean, default true. Drives the status dot. |

Child: `advisor_partner_contacts` — junction to `contacts` with a **free-text**
`role` (no CHECK, unlike the product side), unique per advisor+contact,
cascading on delete.

### Slugs and URLs

Detail routes accept either form. `[id]/page.tsx` calls
`idColumn(id)` (`apps/web/lib/utils.ts`), which returns `'id'` for a UUID and
`'slug'` for anything else, and filters on that column. Cards always link to the
slug form (`/products/{slug}`, `/advisors/{slug}`).

Slugs come from a `BEFORE INSERT` trigger and are **not** regenerated when the
name changes — renaming a product keeps its original URL. Inserts never supply
`slug`; the column has a `DEFAULT ''` purely so the Supabase type generator
treats it as optional (see `20260717020000_slug_default_empty.sql`).

---

## List pages — `/products`, `/advisors`

Titled "Products & services" and "Advisors & partners". Each `page.tsx` is a
thin shell: `PageHeader` plus a `Suspense` boundary (`SkeletonLoader lines={6}
height="100px"`) around the async content component. `loading.tsx` covers the
route-level transition with `PageSkeleton variant="cards"`.

The content component issues three queries in one `Promise.all`:

1. The list itself — a narrow column selection ordered by `created_at DESC`,
   with `companies(name)` and the key-relationship `team_members(full_name)`
   joined in. The team-member join must be disambiguated by constraint name
   (`team_members!products_services_key_relationship_id_fkey`) because both
   tables have two FKs into `team_members` (`key_relationship_id` and
   `created_by`).
2. `getCompanyOptions(supabase)` — company picklist.
3. `getTeamMemberOptions(supabase)` — team-member picklist.

The picklists are fetched here rather than in the form so the create slide-over
opens with its selects already populated.

### Card grid

Three columns, dropping to two at ≤1023px and one at ≤767px, inside a
`--content-max-width` container. A right-aligned primary "Add product" /
"Add advisor" button sits above the grid.

**Product card** — 48px logo tile (falls back to a `Package` icon), name,
category chip using the `categoryLabels` map, then a meta row: company name,
"AU owned" chip when set, key relationship name.

**Advisor card** — 48px avatar (logo, else initials from `getInitials`), name,
`Advisor`/`Partner` chip, specialization line, then a meta row: a coloured dot
with `Active`/`Inactive`, and the company name.

Empty states use the section icon (`Package` / `Handshake`), a heading, one line
of guidance, and a primary button that opens the same create slide-over.

### Creating

Both create forms live in a `SlideOver` with a footer submit button wired to the
form by `form=` id (`product-form`, `advisor-form`), and use `useEntityForm` in
`create` mode plus the shared `FormField` / `FormRow` / `FormSelect` /
`FormTextarea` kit. A hidden `created_by` input carries the current user id from
`useCurrentUser()`.

On success the new row is **prepended to local state** rather than refetched, so
the card appears immediately. The optimistic row is spread from the server
action's returned row with `companies: null` and `team_members: null` — the
insert returns the base row without joins, so a freshly created card shows no
company or key-relationship name until the next full load.

Neither list has search, filtering, or sorting. Ordering is fixed to newest
first.

---

## Detail pages — `/products/[id]`, `/advisors/[id]`

`page.tsx` fetches the row with `companies(id, name)`, `key_relationship`, and
`created_by_member` joined (the latter two aliased off the two `team_members`
FKs), and calls `notFound()` when it misses. Then a second `Promise.all` pulls
the children, the picklists, and every contact (for the "add contact" picker).

Interaction history is a **third, conditional** query: the page collects the
contact ids attached to the record and, only if there is at least one, fetches
up to 50 `interactions` for those contacts ordered by `occurred_at DESC`. With
no key contacts the query is skipped entirely and the section renders "Add key
contacts to see interaction history."

`PageHeader` shows the record name with `backHref` to the list.

### Layout

A 35/65 two-column grid collapsing to one column at ≤767px.

**Left sidebar** — a 72px logo/avatar hero, then a stack of label/value fields
rendered only when populated, ending with `Edit` (secondary) and `Delete`
(ghost) buttons.

- Products: business name, category (+ AU owned chip), company, key
  relationship, description, product image link. When there's no category but
  the product is AU owned, the chip gets its own "Origin" field so the flag is
  never dropped.
- Advisors: type + active dot, company, specialization, engagement model, key
  relationship, rate notes, bio, website (host shown, `https://` stripped),
  LinkedIn.

**Right column** — section cards, each with a title row and (where applicable)
a ghost "Add …" button.

| Section | Products | Advisors |
|---------|----------|----------|
| Key contacts | ✅ role chip from the CHECK list | ✅ free-text role |
| Referral agreements | ✅ | — |
| Interaction history | ✅ | ✅ |

**Key contacts** rows show name, role, email, and an `X` remove button with an
`aria-label` naming the contact. The add-contact form filters out contacts
already attached and renders "All contacts are already added" when none remain.
Note it attaches an *existing* CRM contact — there is no create-contact path
from these pages.

**Referral agreements** rows show counterparty (or "Unnamed agreement"),
type chip, percentage in the mono font, and an Active/Inactive chip (green when
active). Percentage input is `type="number"`, 0–100, step 0.01; `active`
defaults to checked.

**Interaction history** is read-only. Each row shows the interaction summary —
or a synthesised `"{Type} with {Contact}"` when `summary` is null — the
formatted date, the contact name, and a type chip (`call`, `email`, `meeting`,
`zoom`, `signal`, `linkedin`, `note`, `other`).

### Mutations

Edit opens a `SlideOver` over `ProductEditForm` / `AdvisorEditForm`
(`useActionState` + `updateProduct` / `updateAdvisor`), then closes and calls
`router.refresh()`. Add-contact and add-agreement update local state
optimistically; removals filter local state after the action returns. Delete
goes through `ConfirmDialog` in `destructive` mode — its description spells out
the cascade ("This will also remove all key contacts and referral agreements")
— then `router.push()` back to the list.

Errors surface as toasts via `useToast()`; form-level validation errors render
inline under the form.

---

## Server actions

`apps/web/app/actions/products.ts` and `apps/web/app/actions/advisors.ts`. Every
action follows the house pattern:

1. `parseForm(schema, formData)` — Zod validation, returns `{ ok: false, error }`
   on failure.
2. `getAuthedClient()` — request-scoped Supabase client, or an auth error.
3. The query, with `humanizeError(error)` wrapping any Postgres failure.
4. `revalidatePath(...)`, then `{ success: true, ... }`.

| Action | Effect |
|--------|--------|
| `createProduct` | Insert into `products_services`, returns the row. Revalidates `/products`. |
| `updateProduct(id, …)` | Update by id. Revalidates `/products` and `/products/{id}`. |
| `deleteProduct(id)` | Delete (cascades children). Revalidates `/products`. |
| `createReferralAgreement` | Insert; `percentage` parsed with `parseFloat`. Revalidates the product page. |
| `deleteReferralAgreement(id, productId)` | Delete; revalidates the product page. |
| `addProductKeyContact(productId, contactId, role)` | Insert junction row, returns it with the contact joined. |
| `removeProductKeyContact(productId, contactId)` | Delete junction row. |
| `createAdvisor` / `updateAdvisor` / `deleteAdvisor` | Same shape as products. |
| `addAdvisorContact` / `removeAdvisorContact` | Same shape as product key contacts. |

Conventions worth knowing before editing these:

- **Checkboxes.** `australian_owned` and `active` arrive as the string `'on'`
  when ticked and are absent otherwise, so the actions compare `=== 'on'`.
- **Empty strings.** Optional selects submit `''`; every field is coerced with
  `|| null` so blank means NULL, not empty string.
- **UUID-or-empty.** FK fields are typed `z.string().uuid().optional().or(z.literal(''))`.
- **`created_by` is create-only.** The update schemas accept it but the update
  statements never write it, so the original author is preserved.
- **Revalidation uses the UUID.** `updateProduct` revalidates
  `/products/{uuid}`, but the browser is normally sitting on `/products/{slug}`
  — so that path isn't the one revalidated. In practice the edit forms call
  `router.refresh()` on success, which is what actually repaints the page.

## Gaps

- **No tests.** Neither route tree has a `*.test.tsx`. The repo convention for
  server-component pages (mock `@/lib/supabase/server` with the chainable fake
  in `apps/web/test/mocks/supabase.ts`, stub the client child, assert query
  wiring and prop hand-off) is established in
  `apps/web/app/(app)/crm/companies/page.test.tsx` and applies directly here.
- **No search or filtering** on either list — including no filter by category,
  type, or active state, which is the first thing that will hurt as the
  registers grow.
- **Referral agreements are create/delete only** — there's no edit path, so
  correcting a percentage means deleting and re-adding.
- **Advisor contact roles are unconstrained** free text while product contact
  roles come from a CHECK list; the two sides drifted.
