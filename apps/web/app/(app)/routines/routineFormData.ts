import type { RoutineFormValues } from './RoutineForm';

/**
 * Serialises the form values for the server action. Every action type the form
 * can produce needs a branch here — a missing one silently posts a routine with
 * no action_config, which the server then rejects or, worse, blanks.
 */
export function valuesToFormData(v: RoutineFormValues): FormData {
  const fd = new FormData();
  fd.set('name', v.name);
  fd.set('description', v.description ?? '');
  fd.set('agent_name', v.agent_name);
  fd.set('action_type', v.action_type);
  fd.set('frequency', v.frequency);
  fd.set('time_of_day', v.time_of_day);
  fd.set('timezone', v.timezone);
  fd.set('show_on_dashboard', v.show_on_dashboard ? 'true' : 'false');
  fd.set('dashboard_title', v.dashboard_title ?? '');
  fd.set('is_active', v.is_active ? 'true' : 'false');

  const cfg = v.action_config as Record<string, unknown>;
  const lines = (key: string) =>
    Array.isArray(cfg[key]) ? (cfg[key] as string[]).join('\n') : '';

  switch (v.action_type) {
    case 'research_digest':
      fd.set('subject', String(cfg['subject'] ?? ''));
      fd.set('context', String(cfg['context'] ?? ''));
      fd.set('search_queries', lines('search_queries'));
      fd.set('archive_sources', cfg['archive_sources'] ? 'true' : 'false');
      fd.set('max_sources', String(cfg['max_sources'] ?? 10));
      break;
    case 'monitor_change':
      fd.set('subject', String(cfg['subject'] ?? ''));
      fd.set('context', String(cfg['context'] ?? ''));
      fd.set('search_queries', lines('search_queries'));
      fd.set('notify_signal', cfg['notify_signal'] ? 'true' : 'false');
      if (cfg['notify_agent']) fd.set('notify_agent', String(cfg['notify_agent']));
      if (cfg['last_digest']) fd.set('last_digest', String(cfg['last_digest']));
      break;
    case 'news_ingest':
      fd.set('category', String(cfg['category'] ?? ''));
      fd.set('queries', JSON.stringify(Array.isArray(cfg['queries']) ? cfg['queries'] : []));
      fd.set('max_results_per_query', String(cfg['max_results_per_query'] ?? 15));
      fd.set('max_curated', String(cfg['max_curated'] ?? 6));
      if (cfg['relevance_filter']) fd.set('relevance_filter', String(cfg['relevance_filter']));
      break;
    case 'news_source_scan':
      fd.set('max_items_per_source', String(cfg['max_items_per_source'] ?? 10));
      fd.set('lookback_days', String(cfg['lookback_days'] ?? 3));
      break;
    case 'news_curation':
      fd.set('max_stories', String(cfg['max_stories'] ?? 6));
      fd.set('lookback_hours', String(cfg['lookback_hours'] ?? 24));
      break;
    case 'podcast_ingest':
      fd.set('max_items_per_source', String(cfg['max_items_per_source'] ?? 25));
      fd.set('lookback_days', String(cfg['lookback_days'] ?? 14));
      break;
    case 'newsletter':
      fd.set('time_range', String(cfg['time_range'] ?? 'month'));
      fd.set('story_count', String(cfg['story_count'] ?? 5));
      fd.set('target_word_count', String(cfg['target_word_count'] ?? 250));
      fd.set('audience_context', String(cfg['audience_context'] ?? ''));
      fd.set('monthly_guard', cfg['monthly_guard'] ? 'true' : 'false');
      fd.set('one_off', cfg['one_off'] ? 'true' : 'false');
      break;
    case 'social_post_from_news':
      fd.set('founder_team_member_id', String(cfg['founder_team_member_id'] ?? ''));
      fd.set('platforms', JSON.stringify(Array.isArray(cfg['platforms']) ? cfg['platforms'] : []));
      fd.set('lookback_hours', String(cfg['lookback_hours'] ?? 24));
      break;
    case 'indicator_poll':
      fd.set('backfill_periods', String(cfg['backfill_periods'] ?? 18));
      break;
    case 'onchain_poll':
      fd.set('backfill_days', String(cfg['backfill_days'] ?? 90));
      break;
    case 'report_watch_scan':
      fd.set('max_acquisitions_per_run', String(cfg['max_acquisitions_per_run'] ?? 10));
      break;
    case 'market_report':
      break;
  }
  return fd;
}
