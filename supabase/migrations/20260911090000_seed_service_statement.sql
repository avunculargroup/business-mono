-- ============================================================
-- SEED — SERVICE STATEMENT
-- ============================================================
-- Depends on: 20260911010000_compliance_documents.sql
--
-- What the blocking gate serves. Every subscriber acknowledges
-- this before they can reach any route, and a new version
-- re-blocks every active session.
--
-- It has two jobs. Tell the subscriber plainly what they are
-- buying, and be the artefact BTS points to if anyone ever asks
-- why it concluded no authorisation was required. There are no
-- statutory content requirements to structure against — there is
-- no template in the Corporations Act for "we are not doing a
-- regulated thing" — so its value is entirely in being accurate
-- and contemporaneous with launch.
--
-- INSERTED AS 'draft', NOT 'active'.
--
-- The gate serves only an active document, so seeding this as a
-- draft means nobody can pass until a human has reviewed it. That
-- is the intended state: sections 2, 4 and 6 carry the weight and
-- belong in front of whoever advised on the not-advice position,
-- with the product in front of them. Section 8's subscription
-- terms and the privacy policy URL came from conversation rather
-- than from a document and need confirming.
--
-- To publish, after review and after company_profile is filled:
--
--   UPDATE compliance_documents
--      SET status = 'active', effective_from = CURRENT_DATE
--    WHERE doc_type = 'service_statement' AND version = '0.1';
--
-- The body carries {{variables}} resolved at render from
-- company_profile — see packages/shared/src/complianceDocument.ts.
-- A variable with no value blocks the gate rather than rendering
-- a raw placeholder, so an unfilled profile fails closed.
--
-- Two deviations from the bundle's schema note, both deliberate:
--
--   The column is doc_type, not document_type. The bundle
--   describes an existing compliance_documents table with a
--   licensing enum; no such table existed, and this one was
--   created by this work with the column named doc_type. Renaming
--   it now would churn the adapter, the types and the app for no
--   gain.
--
--   'fsg' is NOT in the CHECK constraint. The bundle says to keep
--   the unused licensing values because removing them "buys
--   tidiness and no capability" — an argument against churning an
--   existing enum, which this is not. Adding 'fsg' to a
--   constraint created after the no-authorisation position was
--   settled would add exactly the capability that position says
--   must not be used.
-- ============================================================

INSERT INTO compliance_documents (
  doc_type, title, version, status, notes, body
) VALUES (
  'service_statement',
  'Service Statement',
  '0.1',
  'draft',
  'Seeded with the client app. Not reviewed. Sections 2, 4 and 6 carry the weight; section 8 and the privacy URL came from conversation. See the migration header to publish.',
$statement$# Service Statement

**Minute**, by {{bts_trading_name}}
{{bts_legal_name}} · ABN {{bts_abn}} · ACN {{bts_acn}}

**Version {{statement_version}} · {{statement_date}}**

---

## 1. Please read this before you start

This statement explains what Minute is, what it is not, and how we are paid. It is short on
purpose and there is nothing hidden in it.

You will be asked to confirm you have read it before you use the service. If we change it, we
will ask again and tell you what changed.

## 2. We do not provide financial advice

**Minute provides factual information. It does not provide financial advice of any kind.**

We are not licensed to provide financial advice, we do not hold an Australian Financial
Services Licence, and we are not authorised to act on behalf of anyone who does. We do not
need one, because we do not provide financial advice.

We will never tell you whether to hold bitcoin, how much to hold, when to buy or sell it, or
which provider to use. Nothing in Minute is a recommendation, an opinion on the merits of any
investment, or a statement about what would be suitable for you.

Where you need advice, you should obtain it from a licensed financial adviser, and from your
accountant, auditor or lawyer as appropriate. Minute is designed to help you have a better
conversation with those people, not to replace it.

## 3. We do not know anything about your circumstances

We do not ask for, collect, store or consider your financial position, your objectives, your
holdings, your fund balance, your members, or your risk tolerance.

**Minute has no facility for you to tell us.** There is nowhere in the service to enter that
information, and nowhere in our systems to hold it. This is a deliberate design decision, not
a policy we apply.

If you enter that kind of information into a document you prepare using Minute, it stays on
your device. See section 5.

## 4. What Minute provides

A subscription gives you access to:

- **The Brief** — a regular summary of developments we monitor. If nothing material has
  happened, it says so rather than filling the space.
- **Indicators** — reference data series, each with its source and the date it was accurate.
- **The Register** — a record of how Australian and international entities have publicly
  implemented bitcoin treasury positions: which accounting standard they applied, how they
  held the asset, what authority they relied on, how and when they disclosed it. It exists to
  help you learn from precedent and build your own case. It is not investment research and it
  says nothing about whether any entity is a good or bad investment.
- **Signals** — factual changes we observe at service providers and on public registers. A
  registration lapsed. An attestation is overdue. A policy changed.
- **Directory** — a list of service providers meeting published inclusion criteria, with their
  current regulatory status. Providers do not pay to be listed and cannot pay for position.
  Inclusion is not a recommendation.
- **The Library** — reference material on accounting, custody, and superannuation obligations.
- **Prepare** — structured document tools that help you build a board paper, a trustee minute,
  an investment strategy note or an auditor evidence pack.

## 5. Documents you prepare are yours, and they stay on your device

Prepare gives you a structure and supplies facts with their sources attached. **You write the
content.**

Your written answers are stored in your web browser, on the device you used. They are not
sent to us, we cannot read them, and we do not hold a copy. If you clear your browser data
they are gone, which is why we ask you to download a working copy.

We do not review, approve, check or take responsibility for any document you produce. It is
your document, it carries your reasoning, and you are responsible for its accuracy and for
any decision taken on it.

## 6. What we do not do

We do not:

- Provide financial, taxation, accounting, legal or actuarial advice
- Recommend, rank, endorse or rate any investment, product, platform or service provider
- Buy, sell, hold or arrange the acquisition or disposal of anything on your behalf
- Hold, store or have access to any bitcoin, digital asset, private key, or client money
- Act as your agent, trustee, custodian or representative in any capacity
- Prepare or lodge any document with any regulator on your behalf
- Guarantee any outcome, or make any statement about future prices or performance

## 7. Information, sources and accuracy

Information in Minute is drawn from public sources. We identify the source of each fact and
the date on which it was accurate. Where information is unavailable we say so rather than
leaving it out.

We take reasonable care, but we do not warrant that information is complete, accurate or
current at the time you read it. Sources can be wrong, and facts go out of date. Anything you
rely on, you should verify — and every fact in Minute carries a link so you can.

Bitcoin is volatile. Nothing in Minute should be read as suggesting otherwise, or as
suggesting that any past pattern will continue.

## 8. Your subscription

- Minute is available by invitation. We provision each account individually.
- Your subscription fee, billing period and start date are as agreed with you in writing
  before your subscription begins.
- Your subscription runs for the agreed period and continues until either of us ends it. You
  may cancel at any time by contacting us, effective at the end of your current period.
- We may end a subscription by giving you reasonable notice, and will refund any unused
  portion.
- We may change what Minute includes as the service develops. If we remove something material
  we will tell you before we do it.
- Access is for your organisation or fund. Please do not share your login or redistribute the
  content to people outside it.

## 9. How we are paid

**Your subscription fee is our only revenue from Minute.**

We do not receive commissions, referral fees, rebates, trailing payments, or any other benefit
from any exchange, custodian, platform, product issuer or service provider. No provider can
pay to appear in Minute, to appear higher in it, or to be left out of it.

If we ever have a commercial or reciprocal relationship with an organisation appearing in
Minute, we disclose it on that organisation's own page and list every such relationship in one
place inside the service.

We think this is the reason the service is worth paying for. A record of what providers are
doing is worth something precisely because those providers are not paying us for it.

## 10. Your privacy

We collect the personal information we need to provide the service — your name, your email
address, and your organisation. We handle it in accordance with the Privacy Act 1988 (Cth) and
our Privacy Policy at {{bts_privacy_policy_url}}.

As explained in section 5, documents you prepare are not transmitted to us and we do not hold
them.

## 11. If something goes wrong

Please tell us. We would rather hear from you than not.

Contact {{complaints_contact}}:

- Email: {{complaints_email}}
- Phone: {{complaints_phone}}
- Post: {{bts_registered_address}}, {{bts_registered_state}} {{bts_registered_postcode}}

We will acknowledge your message promptly and do our best to resolve it. If we cannot, you
have rights under the Australian Consumer Law that this statement does not affect or limit.

## 12. Contact us

{{bts_legal_name}}
{{bts_registered_address}}
{{bts_registered_state}} {{bts_registered_postcode}}

Phone: {{bts_public_phone}}
Email: {{bts_public_email}}
Web: {{bts_public_website}}

---

*Service Statement version {{statement_version}}, {{statement_date}}.*


$statement$
);


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- Exactly one, and it is a draft:
--   SELECT doc_type, version, status FROM compliance_documents;
--
-- As a subscriber, expect ZERO rows until it is activated —
-- compliance_documents_client_read filters on status = 'active':
--   SELECT count(*) FROM compliance_documents;
--
-- Every placeholder in the body must be one the resolver knows.
-- Asserted in apps/client/lib/serviceStatement.test.ts rather than
-- here, because the list lives in TypeScript.
-- ------------------------------------------------------------
