-- Whether the article behind a news item sits behind a paywall, detected at
-- ingestion time from the source page (schema.org isAccessibleForFree=false or
-- an article:content_tier of locked/metered) or from a subscribe-to-continue
-- stub in the fetched body. Nullable on purpose: null means "not checked" (rows
-- ingested before this column, email newsletter bodies, or a page that could not
-- be fetched), which is a different claim from false ("checked, open to read").
-- Surfaced as a "Paywall" pill on the daily news_curation digest.
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS paywalled BOOLEAN;
