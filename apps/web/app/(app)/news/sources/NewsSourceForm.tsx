'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Rss, Mic, Youtube, Mail } from 'lucide-react';
import type { NewsSourceType, NewsTier } from '@platform/shared';
import { slugify, computeInboundAddress, RESEARCH_INBOUND_DOMAIN } from '@/lib/news/emailSource';
import styles from './sources.module.css';

export interface NewsSourceFormValues {
  name: string;
  source_type: NewsSourceType;
  site_url: string;
  feed_url: string;
  youtube_channel_url: string;
  is_active: boolean;
  transcribe_with_deepgram: boolean;
  preferred_transcript_lang: string;
  max_backfill_episodes: number;
  max_episode_age_days: number | null;
  // Email source fields.
  slug: string;
  tier: NewsTier | '';
  relevance_threshold: number;
  sender_allowlist: string; // textarea: one entry per line
}

const DEFAULTS: NewsSourceFormValues = {
  name: '',
  source_type: 'rss',
  site_url: '',
  feed_url: '',
  youtube_channel_url: '',
  is_active: true,
  transcribe_with_deepgram: false,
  preferred_transcript_lang: 'en',
  max_backfill_episodes: 25,
  max_episode_age_days: null,
  slug: '',
  tier: 'tier_2',
  relevance_threshold: 0.7,
  sender_allowlist: '',
};

const TYPE_OPTIONS: { value: NewsSourceType; label: string; icon: typeof Rss }[] = [
  { value: 'rss', label: 'Article feed', icon: Rss },
  { value: 'podcast', label: 'Podcast', icon: Mic },
  { value: 'youtube', label: 'YouTube', icon: Youtube },
  { value: 'email', label: 'Email', icon: Mail },
];

const TIER_OPTIONS: { value: NewsTier; label: string }[] = [
  { value: 'tier_1', label: 'Tier 1' },
  { value: 'tier_2', label: 'Tier 2' },
  { value: 'tier_3', label: 'Tier 3' },
];

interface Props {
  initialValues?: NewsSourceFormValues;
  onSubmit: (values: NewsSourceFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
  inboundDomain?: string;
}

export function NewsSourceForm({ initialValues, onSubmit, onCancel, submitting, inboundDomain }: Props) {
  const [values, setValues] = useState<NewsSourceFormValues>(initialValues ?? DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  // Track whether the slug was hand-edited, so auto-suggest-from-name stops.
  const [slugTouched, setSlugTouched] = useState<boolean>(Boolean(initialValues?.slug));

  const update = <K extends keyof NewsSourceFormValues>(key: K, val: NewsSourceFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: val }));

  const type = values.source_type;
  const isPodcast = type === 'podcast';
  const isYoutube = type === 'youtube';
  const isEmail = type === 'email';
  const hasTranscriptSettings = isPodcast || isYoutube;
  const domain = inboundDomain ?? RESEARCH_INBOUND_DOMAIN;
  const previewSlug = slugify(values.slug);

  // Name drives the slug suggestion until the user edits the slug directly.
  const handleNameChange = (name: string) => {
    setValues((v) => ({
      ...v,
      name,
      slug: !slugTouched ? slugify(name) : v.slug,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!values.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (isEmail) {
      if (!previewSlug) {
        setError('Enter a slug — it forms the inbound address newsletters are sent to.');
        return;
      }
    } else if (isYoutube) {
      if (!values.youtube_channel_url.trim()) {
        setError('Enter a channel or playlist URL for a YouTube source.');
        return;
      }
    } else {
      const isSubstack = /(^|\.)substack\.com/i.test(values.site_url.trim());
      if (!values.feed_url.trim() && !(type === 'rss' && isSubstack)) {
        setError(
          isPodcast
            ? 'Enter the podcast feed URL.'
            : 'Enter a feed URL (RSS/Atom), or a Substack site URL so the feed can be derived.',
        );
        return;
      }
    }
    onSubmit({
      ...values,
      name: values.name.trim(),
      site_url: values.site_url.trim(),
      feed_url: values.feed_url.trim(),
      youtube_channel_url: values.youtube_channel_url.trim(),
      slug: previewSlug,
      // Deepgram only applies to types that produce transcripts.
      transcribe_with_deepgram: hasTranscriptSettings ? values.transcribe_with_deepgram : false,
    });
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {error && <div className={styles.formError}>{error}</div>}

      <div className={styles.field}>
        <label className={styles.label}>Source type</label>
        <div className={styles.segmented} role="radiogroup" aria-label="Source type">
          {TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = type === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                className={`${styles.segment} ${active ? styles.segmentActive : ''}`}
                onClick={() => update('source_type', opt.value)}
              >
                <Icon size={15} strokeWidth={1.5} />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Name</label>
        <input
          className={styles.input}
          value={values.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder={isPodcast ? 'What Bitcoin Did' : isYoutube ? 'Channel name' : isEmail ? 'Gromen Tree Rings' : 'Bitcoin Magazine'}
          required
        />
      </div>

      {/* Email newsletter source. */}
      {isEmail && (
        <div className={styles.revealGroup}>
          <div className={styles.field}>
            <label className={styles.label}>Slug</label>
            <input
              className={`${styles.input} ${styles.inputMono}`}
              value={values.slug}
              onChange={(e) => { setSlugTouched(true); update('slug', e.target.value); }}
              placeholder="gromen"
            />
            <span className={styles.hint}>
              Subscribe the newsletter using{' '}
              <strong>{previewSlug ? computeInboundAddress(previewSlug, domain) : `research+{slug}@${domain}`}</strong>.
              The first email is ingested as a test.
            </span>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>Tier</label>
              <div className={styles.segmented} role="radiogroup" aria-label="Tier">
                {TIER_OPTIONS.map((opt) => {
                  const active = values.tier === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`${styles.segment} ${active ? styles.segmentActive : ''}`}
                      onClick={() => update('tier', opt.value)}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Relevance threshold</label>
              <input
                className={`${styles.input} ${styles.inputMono}`}
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={values.relevance_threshold}
                onChange={(e) => update('relevance_threshold', Number(e.target.value))}
              />
              <span className={styles.hint}>Items below this score are de-emphasised in the feed.</span>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Sender allowlist</label>
            <textarea
              className={styles.input}
              rows={3}
              value={values.sender_allowlist}
              onChange={(e) => update('sender_allowlist', e.target.value)}
              placeholder={'gromen.com\nnewsletter@bitwise.com'}
            />
            <span className={styles.hint}>
              Approved From domains or addresses, one per line. Leave empty to accept the first sender, then
              trust it from the source list.
            </span>
          </div>
        </div>
      )}

      {/* Article-feed and podcast share the feed-URL fields. */}
      {!isYoutube && !isEmail && (
        <div className={styles.revealGroup}>
          {type === 'rss' && (
            <div className={styles.field}>
              <label className={styles.label}>Site URL</label>
              <input
                className={styles.input}
                type="url"
                value={values.site_url}
                onChange={(e) => update('site_url', e.target.value)}
                placeholder="https://bitcoinmagazine.com"
              />
              <span className={styles.hint}>For Substack blogs, the feed is derived automatically from the site URL.</span>
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Feed URL</label>
            <input
              className={styles.input}
              type="url"
              value={values.feed_url}
              onChange={(e) => update('feed_url', e.target.value)}
              placeholder={isPodcast ? 'https://feeds.example.com/show' : 'https://bitcoinmagazine.com/feed'}
            />
            <span className={styles.hint}>
              {isPodcast
                ? 'The podcast RSS feed scanned for new episodes.'
                : 'The RSS or Atom feed scanned for new articles. Required for non-Substack sources.'}
            </span>
          </div>
        </div>
      )}

      {/* YouTube channel — required for youtube, optional aid for podcast. */}
      {(isYoutube || isPodcast) && (
        <div className={styles.field}>
          <label className={styles.label}>
            YouTube channel{isPodcast ? ' (optional)' : ''}
          </label>
          <input
            className={styles.input}
            type="url"
            value={values.youtube_channel_url}
            onChange={(e) => update('youtube_channel_url', e.target.value)}
            placeholder="https://youtube.com/@channel"
          />
          <span className={styles.hint}>
            {isPodcast
              ? 'Helps the transcript waterfall fall back to free YouTube captions.'
              : 'Channel or playlist to monitor.'}
          </span>
        </div>
      )}

      {/* Transcript settings — podcast and youtube only. */}
      {hasTranscriptSettings && (
        <div className={styles.revealGroup}>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>Transcript language</label>
              <input
                className={styles.input}
                value={values.preferred_transcript_lang}
                onChange={(e) => update('preferred_transcript_lang', e.target.value)}
                placeholder="en"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Backfill cap</label>
              <input
                className={`${styles.input} ${styles.inputMono}`}
                type="number"
                min={1}
                value={values.max_backfill_episodes}
                onChange={(e) => update('max_backfill_episodes', Number(e.target.value) || 0)}
              />
              <span className={styles.hint}>Episodes ingested on first fetch.</span>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Max age (days)</label>
              <input
                className={`${styles.input} ${styles.inputMono}`}
                type="number"
                min={0}
                value={values.max_episode_age_days ?? ''}
                placeholder="—"
                onChange={(e) =>
                  update('max_episode_age_days', e.target.value === '' ? null : Number(e.target.value))
                }
              />
              <span className={styles.hint}>Optional. Skip Deepgram beyond this.</span>
            </div>
          </div>

          {/* The money switch. Default off; an honest warning line when on. */}
          {isPodcast && (
            <div className={styles.moneySwitch}>
              <label className={styles.switchRow}>
                <input
                  type="checkbox"
                  checked={values.transcribe_with_deepgram}
                  onChange={(e) => update('transcribe_with_deepgram', e.target.checked)}
                />
                <span className={styles.switchTrack} aria-hidden="true">
                  <span className={styles.switchThumb} />
                </span>
                <span className={styles.switchLabel}>Transcribe with Deepgram when no free transcript exists</span>
              </label>
              {values.transcribe_with_deepgram && (
                <p className={styles.moneyWarning}>
                  Deepgram transcription is billed per minute of audio. Only used when no free transcript
                  (feed or YouTube) is available.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={values.is_active}
          onChange={(e) => update('is_active', e.target.checked)}
        />
        <span>Active — include this source in the daily scan</span>
      </label>

      <div className={styles.formActions}>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={submitting}>
          {initialValues ? 'Save source' : 'Add source'}
        </Button>
      </div>
    </form>
  );
}
