-- Publishers whose articles sit behind a paywall — hard or metered — edited from
-- /news/sources. Ingestion marks a web article paywalled when its host is one of
-- these domains or a subdomain of one. This is the fallback for publishers that
-- block the page fetch outright (Bloomberg, FT): a blocked fetch says nothing
-- about a paywall, since free sites like The Block and Reuters block it too, so
-- the domain has to be named. Page and body signals still apply everywhere;
-- a listed domain only ever adds the flag.
CREATE TABLE IF NOT EXISTS paywalled_domains (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Bare registrable host, lowercase, no scheme, path or leading www.
  domain      TEXT        NOT NULL UNIQUE
                CHECK (domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' AND domain !~ '^www\.'),
  created_by  UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE paywalled_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paywalled_domains_team" ON paywalled_domains
  FOR ALL USING (is_team_member());

-- Seed: hard paywalls, then metered ones (a metered wall still stops a reader
-- partway through the month, so it is marked the same way).
INSERT INTO paywalled_domains (domain) VALUES
  ('bloomberg.com'),
  ('ft.com'),
  ('wsj.com'),
  ('barrons.com'),
  ('economist.com'),
  ('afr.com'),
  ('theaustralian.com.au'),
  ('theinformation.com'),
  ('seekingalpha.com'),
  ('heraldsun.com.au'),
  ('thetimes.com'),
  ('smh.com.au'),
  ('theage.com.au'),
  ('project-syndicate.org'),
  ('nytimes.com'),
  ('washingtonpost.com'),
  ('marketwatch.com'),
  ('telegraph.co.uk'),
  ('foreignaffairs.com')
ON CONFLICT (domain) DO NOTHING;
