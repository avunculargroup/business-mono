-- ============================================================
-- Add watched_addresses to fastmail_accounts
-- ============================================================
-- Allows per-account filtering by specific email addresses.
-- When non-empty, only emails where at least one participant
-- (To, Cc, or From) matches a watched address are logged.
-- Empty array (default) = watch all addresses on the account.
-- ============================================================

ALTER TABLE fastmail_accounts
  ADD COLUMN IF NOT EXISTS watched_addresses TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN fastmail_accounts.watched_addresses IS
  'Specific email addresses to watch on this account (aliases). '
  'Empty = watch all addresses. Non-empty = skip emails where no '
  'participant matches a watched address.';
