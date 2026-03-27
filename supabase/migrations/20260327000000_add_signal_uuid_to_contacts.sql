-- Add signal_uuid to contacts so Signal messages sent without a phone number
-- (Signal's "hide number" feature) can still be resolved to a contact name.
-- The column stores the Signal Account Identifier (ACI UUID) for the contact.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS signal_uuid TEXT UNIQUE;

COMMENT ON COLUMN contacts.signal_uuid IS
  'Signal Account Identifier (ACI UUID) — populated when a contact uses Signal''s hide-number feature so their phone number is not visible to signal-cli.';
