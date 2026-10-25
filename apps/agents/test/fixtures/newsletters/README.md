# Newsletter golden fixtures

One HTML email per template family, each with the markdown `htmlToMarkdown`
must produce from it (`<name>.md`). Exercised by
`src/lib/emailClean.fixtures.test.ts`, which also turns each cleaning rule off
in turn and requires at least one fixture to change.

**These are synthetic.** They reproduce each platform's template structure —
preheader spacers, layout tables, wrapper URL shapes, footer blocks — but every
token, member id, subscriber id and redirect payload is a placeholder, and the
article text is filler. `business-mono` is public: never commit a raw email or
a URL copied from `news_items`. When a template changes, rebuild its fixture by
hand from the structure in `news_item_raw`, not by pasting from it.

| Fixture | Family | What it exercises |
| --- | --- | --- |
| `hubspot-fear-greed` | HubSpot | `display:none` preheader with U+034F spacer, opaque `hubspotlinks.com` links → text, `_hsenc` stripped, presentation tables, share block, preferences footer |
| `ghost-tftc` | Ghost | `.preheader`, "View in browser" twice, `/r/<id>?m=` member redirects → text, data table → GFM, `-` escaping, repeated dividers, address footer |
| `customerio-glassnode` | Customer.io | `/e/c/` payloads decoded offline, image-only chart anchors, a social-icon list (the case `imageAnchors` and `emptyContainers` exist for — without them it leaves bare `-` bullets), `font-size:0` preview, `width`/`align` layout tables |
| `substack-pompliano` | Substack | `opacity:0;max-height:0` preheader, `substack.com/redirect` → text, app-nag params stripped, Like/Comment/Restack chrome |
| `seeking-alpha` | Seeking Alpha | base64 click paths decoded, `userid`/`mailingid` stripped, thumbnail anchors, `bgcolor` tables |
| `plain-text` | Plain text only | `normaliseMarkdown` alone: invisible characters, subject line, repeated lines |
