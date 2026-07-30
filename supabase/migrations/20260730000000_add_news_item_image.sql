-- og:image (falling back to twitter:image) scraped from the source web page at
-- ingestion time, via fetchOgImage. Null when the page has no meta image or the
-- scrape failed — best-effort, never blocks ingestion. Populated by the web-page
-- ingestion paths (RSS scan, Tavily search ingest, newsletter followed links);
-- email-sourced items (the newsletter body itself) leave this null by design.
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS image_url TEXT;
