# Service Statement — Draft Template

**Document type:** `service_statement` (new value for `compliance_documents.document_type`)
**For:** Minute, by Bitcoin Treasury Solutions
**Status:** `draft`
**Last updated:** 2026-09-11

---

## What this document is for

Minute's blocking gate serves this at first login. A subscriber cannot reach any route until
they acknowledge it, and a new version re-blocks every active session.

It has two jobs, and the second one is the reason to write it carefully.

**Job one:** tell the subscriber plainly what they are buying and what they are not.

**Job two:** be the artefact BTS points to if anyone ever asks why it concluded no
authorisation was required. Unlike an FSG there are no statutory content requirements to
structure against — there is no template in the Corporations Act for "we are not doing a
regulated thing" — which makes this easier to write and more worth having a lawyer read. Its
value is entirely in being accurate and in being contemporaneous with the launch.

**This is a draft.** Sections 2, 4 and 6 carry the weight; those are the ones to put in front
of whoever advised on the position, with the product in front of them.

**Two things came from conversation rather than from a document:** the subscription terms in
section 7 and the privacy URL. Confirm both before this goes `active`.

---

## Schema note

`compliance_documents.document_type` needs a new value:

```sql
ALTER TABLE compliance_documents
  DROP CONSTRAINT compliance_documents_document_type_check;

ALTER TABLE compliance_documents
  ADD CONSTRAINT compliance_documents_document_type_check
  CHECK (document_type IN (
    'fsg', 'soa', 'roa', 'tmd', 'pds', 'cpd', 'afs_report',
    'breach_report', 'service_statement', 'template', 'other'
  ));
```

The licensing values stay in the enum. They are unused, they cost nothing, and removing them
is a migration that buys tidiness and no capability.

---

## Template body

Everything below goes in `compliance_documents.body`.

---

# Service Statement

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

---

## Notes on specific sections

**Section 2** is the whole document. Everything else is detail. The three sentences of the
first two paragraphs are the position, stated plainly and without hedging, and hedging them
would weaken the only thing this document is for.

**Section 3** works because it is true about the schema. "Minute has no facility for you to
tell us" is a verifiable claim about `client_accounts`, not a promise about conduct. If a
column capable of holding financial position is ever added, this sentence becomes false and
the document becomes misleading — which is a useful tripwire, and worth a comment in the
migration.

**Section 4's Register paragraph** carries the implementation-facts-not-outcome-facts rule in
plain language. If the register ever shows current holding value or share price movement, this
paragraph stops being accurate.

**Section 5** is the local-only storage model stated as a promise, and it is only keepable
because of the two-layer architecture. The network-tab check at the end of `SESSIONS.md`
verifies it.

**Section 7** — "every fact in Minute carries a link so you can" is a commitment the
provenance rail already meets. Do not write it if a surface ships without sources.

**Section 8** is drafted from conversation, not from a terms document. Confirm the billing
period, notice period and refund position before this goes `active`. If BTS later adopts
separate subscription terms, section 8 should shrink to a cross-reference rather than
duplicating them — two documents describing the same terms will eventually disagree.

**Section 9's closing paragraph** is the only place in the document with a point of view. It
is a statement about BTS's business model rather than about any investment, which is why it is
safe, and it is worth keeping because it explains the no-referrals decision to the person
paying for it.

**Section 11** deliberately does not mention AFCA. AFCA handles complaints about financial
firms; referring subscribers there would imply a status BTS does not have. Australian Consumer
Law is the correct and sufficient reference.
