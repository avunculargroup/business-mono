-- Widen the seeded news_ingest routines so the pipeline gathers a larger
-- candidate pool and lets the LLM judge curate the top stories.
--
-- max_results_per_query: 5 → 15 (Tavily returns ~3x as many raw articles)
-- max_curated: new field, hard cap on stories ingested per run after ranking
--
-- Idempotent: only updates routines that still match the original 5-result config,
-- so manual edits via the UI are preserved.

UPDATE routines
SET action_config = jsonb_set(
                      jsonb_set(action_config, '{max_results_per_query}', to_jsonb(15)),
                      '{max_curated}', to_jsonb(6)
                    )
WHERE action_type = 'news_ingest'
  AND name IN (
    'News: Regulatory (AU)',
    'News: Corporate (AU)',
    'News: Macro (AU)',
    'News: International'
  )
  AND (action_config ->> 'max_results_per_query')::int = 5
  AND NOT (action_config ? 'max_curated');
