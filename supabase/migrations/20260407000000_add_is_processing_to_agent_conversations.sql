ALTER TABLE agent_conversations
  ADD COLUMN IF NOT EXISTS is_processing BOOLEAN NOT NULL DEFAULT false;
