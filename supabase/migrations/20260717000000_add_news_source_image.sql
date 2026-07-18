-- Show-level artwork for news sources. Populated for podcast sources by the
-- podcast_ingest routine from the feed's channel-level <itunes:image> (falling
-- back to the standard RSS <image><url>) on each successful scan. The podcasts
-- page (/news/podcasts/feeds) prefers this over the newest episode's image.
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS image_url TEXT;
