-- Macro news routine: skip the Australian-or-Bitcoin relevance gate.
--
-- runNewsIngest dropped every story judged neither Bitcoin- nor AU-relevant,
-- which discarded legitimate global macro stories (e.g. US Fed decisions, global
-- inflation). The relevance gate is now per-routine via the action_config
-- `relevance_filter` field; macro opts out with 'none' and trusts the LLM judge's
-- curation. Other categories keep the default 'au_or_bitcoin' behaviour.
--
-- Idempotent: re-running merges the same key.

UPDATE routines
SET action_config = action_config || '{"relevance_filter": "none"}'::jsonb,
    updated_at = NOW()
WHERE action_type = 'news_ingest'
  AND action_config->>'category' = 'macro';
