'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Rss, Mic, Youtube, Mail, FileText, ArrowUp, ArrowDown, Check, X } from 'lucide-react';
import type {
  NewsSourceType,
  NewsTier,
  ReportDetectionStrategy,
  ReportRedistribution,
} from '@platform/shared';
import { slugify, computeInboundAddress, RESEARCH_INBOUND_DOMAIN } from '@/lib/news/emailSource';
import { testReportDetection } from '@/app/actions/reportWatch';
import type { DetectionPreview } from '@/lib/news/testDetection';
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
  follow_links: boolean;
  max_followed_links: number;
  // Report-watch fields. Ordered — the first strategy that returns candidates
  // wins and the rest are not run.
  detection_strategies: ReportDetectionStrategy[];
  rss_feed_url: string;
  sitemap_url: string;
  sitemap_path_prefix: string;
  sitemap_path_exclude: string;
  index_url: string;
  item_selector: string;
  link_selector: string;
  title_selector: string;
  date_selector: string;
  follow_to_pdf: boolean;
  pdf_link_selector: string;
  url_must_match: string;
  url_must_not_match: string;
  redistribution_default: ReportRedistribution;
  licence_notes: string;
  ocr_enabled: boolean;
  ocr_page_limit: number;
  crawl_delay_seconds: number;
  max_candidates_per_run: number;
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
  follow_links: false,
  max_followed_links: 5,
  detection_strategies: ['index_page'],
  rss_feed_url: '',
  sitemap_url: '',
  sitemap_path_prefix: '',
  sitemap_path_exclude: '',
  index_url: '',
  item_selector: '',
  link_selector: '',
  title_selector: '',
  date_selector: '',
  follow_to_pdf: false,
  pdf_link_selector: '',
  url_must_match: '',
  url_must_not_match: '',
  redistribution_default: 'internal_only',
  licence_notes: '',
  ocr_enabled: false,
  ocr_page_limit: 40,
  crawl_delay_seconds: 5,
  max_candidates_per_run: 25,
};

const STRATEGY_OPTIONS: { value: ReportDetectionStrategy; label: string; hint: string }[] = [
  { value: 'rss', label: 'Feed', hint: 'Cheapest. Only works where the publisher has one.' },
  { value: 'sitemap', label: 'Sitemap', hint: 'Good for large publishers with tidy URL paths.' },
  { value: 'index_page', label: 'Index page', hint: 'Scrapes a reports page. Needed where there is no feed or sitemap.' },
];

const REDISTRIBUTION_OPTIONS: { value: ReportRedistribution; label: string; hint: string }[] = [
  { value: 'internal_only', label: 'Internal only', hint: 'Informs our understanding. Never quoted in published content.' },
  { value: 'quotable', label: 'Quotable', hint: 'Short quotations with attribution are permitted.' },
  { value: 'client_shareable', label: 'Client shareable', hint: 'May be quoted and included in client-facing material.' },
];

/** Newline/comma-separated list → trimmed array. */
function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const TYPE_OPTIONS: { value: NewsSourceType; label: string; icon: typeof Rss }[] = [
  { value: 'rss', label: 'Article feed', icon: Rss },
  { value: 'podcast', label: 'Podcast', icon: Mic },
  { value: 'youtube', label: 'YouTube', icon: Youtube },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'report_watch', label: 'Reports', icon: FileText },
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
  const [preview, setPreview] = useState<DetectionPreview | null>(null);
  const [testing, setTesting] = useState<ReportDetectionStrategy | null>(null);

  const update = <K extends keyof NewsSourceFormValues>(key: K, val: NewsSourceFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: val }));

  const type = values.source_type;
  const isPodcast = type === 'podcast';
  const isYoutube = type === 'youtube';
  const isEmail = type === 'email';
  const isReportWatch = type === 'report_watch';
  const hasTranscriptSettings = isPodcast || isYoutube;
  const strategies = values.detection_strategies;

  const toggleStrategy = (value: ReportDetectionStrategy) =>
    setValues((v) => ({
      ...v,
      detection_strategies: v.detection_strategies.includes(value)
        ? v.detection_strategies.filter((s) => s !== value)
        : [...v.detection_strategies, value],
    }));

  // Order is meaningful — the first strategy to return candidates wins — so it
  // is explicitly reorderable rather than inferred from selection order.
  const moveStrategy = (index: number, delta: number) =>
    setValues((v) => {
      const next = [...v.detection_strategies];
      const target = index + delta;
      if (target < 0 || target >= next.length) return v;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...v, detection_strategies: next };
    });

  /** The live config blob, shared by the submit path and the dry run. */
  const detectionConfig = () => {
    const cfg: Record<string, unknown> = {};
    if (strategies.includes('rss') && values.rss_feed_url.trim()) {
      cfg.rss = { feed_url: values.rss_feed_url.trim() };
    }
    if (strategies.includes('sitemap') && values.sitemap_url.trim()) {
      cfg.sitemap = {
        sitemap_url: values.sitemap_url.trim(),
        ...(values.sitemap_path_prefix.trim() ? { path_prefix: values.sitemap_path_prefix.trim() } : {}),
        ...(parseList(values.sitemap_path_exclude).length
          ? { path_exclude: parseList(values.sitemap_path_exclude) }
          : {}),
      };
    }
    if (strategies.includes('index_page') && values.index_url.trim()) {
      cfg.index_page = {
        index_url: values.index_url.trim(),
        item_selector: values.item_selector.trim(),
        ...(values.link_selector.trim() ? { link_selector: values.link_selector.trim() } : {}),
        ...(values.title_selector.trim() ? { title_selector: values.title_selector.trim() } : {}),
        ...(values.date_selector.trim() ? { date_selector: values.date_selector.trim() } : {}),
        follow_to_pdf: values.follow_to_pdf,
        ...(values.pdf_link_selector.trim() ? { pdf_link_selector: values.pdf_link_selector.trim() } : {}),
      };
    }
    const mustMatch = parseList(values.url_must_match);
    const mustNot = parseList(values.url_must_not_match);
    if (mustMatch.length || mustNot.length) {
      cfg.url_filters = {
        ...(mustMatch.length ? { must_match: mustMatch } : {}),
        ...(mustNot.length ? { must_not_match: mustNot } : {}),
      };
    }
    return cfg;
  };

  const runTest = async (strategy: ReportDetectionStrategy) => {
    setTesting(strategy);
    setPreview(null);
    setPreview(await testReportDetection(strategy, detectionConfig()));
    setTesting(null);
  };
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
    } else if (isReportWatch) {
      if (strategies.length === 0) {
        setError('Choose at least one detection strategy.');
        return;
      }
      if (strategies.includes('rss') && !values.rss_feed_url.trim()) {
        setError('Enter the feed URL for the feed strategy, or remove it.');
        return;
      }
      if (strategies.includes('sitemap') && !values.sitemap_url.trim()) {
        setError('Enter the sitemap URL for the sitemap strategy, or remove it.');
        return;
      }
      if (strategies.includes('index_page') && (!values.index_url.trim() || !values.item_selector.trim())) {
        setError('The index-page strategy needs both a page URL and an item selector.');
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

          {/* The money switch. Default off; an honest warning line when on. */}
          <div className={styles.moneySwitch}>
            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={values.follow_links}
                onChange={(e) => update('follow_links', e.target.checked)}
              />
              <span className={styles.switchTrack} aria-hidden="true">
                <span className={styles.switchThumb} />
              </span>
              <span className={styles.switchLabel}>Fetch the articles this newsletter links to</span>
            </label>
            {values.follow_links && (
              <>
                <p className={styles.moneyWarning}>
                  Each followed link costs a page fetch and two model calls. Best for link roundups, not
                  long-form essays that only cite their sources in passing.
                </p>
                <div className={styles.field}>
                  <label className={styles.label}>Maximum links per issue</label>
                  <input
                    className={`${styles.input} ${styles.inputMono}`}
                    type="number"
                    min={0}
                    max={20}
                    step={1}
                    value={values.max_followed_links}
                    onChange={(e) => update('max_followed_links', Number(e.target.value))}
                  />
                  <span className={styles.hint}>
                    Links are taken in the order they appear. A separate cap limits how many are followed
                    across all sources in one poll.
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Report watch — publishers who put a PDF on a page and expect a human
          to notice. Progressive disclosure by strategy: only the fields for the
          selected strategies are shown, in the order they will be tried. */}
      {isReportWatch && (
        <div className={styles.revealGroup}>
          <div className={styles.field}>
            <label className={styles.label}>Site URL</label>
            <input
              className={styles.input}
              type="url"
              value={values.site_url}
              onChange={(e) => update('site_url', e.target.value)}
              placeholder="https://river.com"
            />
            <span className={styles.hint}>Used to resolve relative links found during detection.</span>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Detection strategies</label>
            <div className={styles.strategyPicker}>
              {STRATEGY_OPTIONS.map((opt) => {
                const active = strategies.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    className={`${styles.strategyChip} ${active ? styles.strategyChipActive : ''}`}
                    onClick={() => toggleStrategy(opt.value)}
                    title={opt.hint}
                  >
                    {active && <Check size={13} strokeWidth={2} />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {strategies.length > 0 && (
              <ol className={styles.strategyOrder}>
                {strategies.map((value, i) => {
                  const opt = STRATEGY_OPTIONS.find((o) => o.value === value);
                  return (
                    <li key={value} className={styles.strategyOrderRow}>
                      <span className={styles.strategyOrderIndex}>{i + 1}</span>
                      <span className={styles.strategyOrderLabel}>{opt?.label ?? value}</span>
                      <span className={styles.strategyOrderActions}>
                        <button
                          type="button"
                          aria-label={`Move ${opt?.label ?? value} earlier`}
                          disabled={i === 0}
                          onClick={() => moveStrategy(i, -1)}
                        >
                          <ArrowUp size={13} strokeWidth={1.5} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${opt?.label ?? value} later`}
                          disabled={i === strategies.length - 1}
                          onClick={() => moveStrategy(i, 1)}
                        >
                          <ArrowDown size={13} strokeWidth={1.5} />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            <span className={styles.hint}>
              Tried in this order. The first strategy that returns candidates wins — the rest are not run.
            </span>
          </div>

          {strategies.includes('rss') && (
            <div className={styles.strategyBlock}>
              <div className={styles.strategyHeader}>
                <span className={styles.strategyTitle}>Feed</span>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => runTest('rss')}
                  loading={testing === 'rss'}
                  disabled={testing !== null}
                >
                  Test detection
                </Button>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Feed URL</label>
                <input
                  className={styles.input}
                  type="url"
                  value={values.rss_feed_url}
                  onChange={(e) => update('rss_feed_url', e.target.value)}
                  placeholder="https://river.com/learn/rss.xml"
                />
              </div>
            </div>
          )}

          {strategies.includes('sitemap') && (
            <div className={styles.strategyBlock}>
              <div className={styles.strategyHeader}>
                <span className={styles.strategyTitle}>Sitemap</span>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => runTest('sitemap')}
                  loading={testing === 'sitemap'}
                  disabled={testing !== null}
                >
                  Test detection
                </Button>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Sitemap URL</label>
                <input
                  className={styles.input}
                  type="url"
                  value={values.sitemap_url}
                  onChange={(e) => update('sitemap_url', e.target.value)}
                  placeholder="https://river.com/sitemap.xml"
                />
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Path prefix</label>
                  <input
                    className={`${styles.input} ${styles.inputMono}`}
                    value={values.sitemap_path_prefix}
                    onChange={(e) => update('sitemap_path_prefix', e.target.value)}
                    placeholder="/reports/"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Exclude paths</label>
                  <input
                    className={`${styles.input} ${styles.inputMono}`}
                    value={values.sitemap_path_exclude}
                    onChange={(e) => update('sitemap_path_exclude', e.target.value)}
                    placeholder="/reports/archive/"
                  />
                  <span className={styles.hint}>One per line, or comma-separated.</span>
                </div>
              </div>
            </div>
          )}

          {strategies.includes('index_page') && (
            <div className={styles.strategyBlock}>
              <div className={styles.strategyHeader}>
                <span className={styles.strategyTitle}>Index page</span>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => runTest('index_page')}
                  loading={testing === 'index_page'}
                  disabled={testing !== null}
                >
                  Test detection
                </Button>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Reports page URL</label>
                <input
                  className={styles.input}
                  type="url"
                  value={values.index_url}
                  onChange={(e) => update('index_url', e.target.value)}
                  placeholder="https://river.com/reports"
                />
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Item selector</label>
                  <input
                    className={`${styles.input} ${styles.inputMono}`}
                    value={values.item_selector}
                    onChange={(e) => update('item_selector', e.target.value)}
                    placeholder="article.report-card"
                  />
                  <span className={styles.hint}>The repeating card or row. Test detection tells you if it matches.</span>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Link selector</label>
                  <input
                    className={`${styles.input} ${styles.inputMono}`}
                    value={values.link_selector}
                    onChange={(e) => update('link_selector', e.target.value)}
                    placeholder="a[href]"
                  />
                </div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Title selector</label>
                  <input
                    className={`${styles.input} ${styles.inputMono}`}
                    value={values.title_selector}
                    onChange={(e) => update('title_selector', e.target.value)}
                    placeholder="h3"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Date selector</label>
                  <input
                    className={`${styles.input} ${styles.inputMono}`}
                    value={values.date_selector}
                    onChange={(e) => update('date_selector', e.target.value)}
                    placeholder="time"
                  />
                </div>
              </div>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={values.follow_to_pdf}
                  onChange={(e) => update('follow_to_pdf', e.target.checked)}
                />
                <span>Follow the card link one hop to find the PDF</span>
              </label>
              {values.follow_to_pdf && (
                <div className={styles.field}>
                  <label className={styles.label}>PDF link selector</label>
                  <input
                    className={`${styles.input} ${styles.inputMono}`}
                    value={values.pdf_link_selector}
                    onChange={(e) => update('pdf_link_selector', e.target.value)}
                    placeholder="a[href$='.pdf']"
                  />
                  <span className={styles.hint}>
                    Applied on the landing page. Exactly one hop is followed, never more.
                  </span>
                </div>
              )}
            </div>
          )}

          {preview && (
            <div className={styles.previewPanel} role="status">
              {!preview.ok ? (
                <p className={styles.previewError}>{preview.error}</p>
              ) : (
                <>
                  <p className={styles.previewSummary}>
                    <span className={styles.inputMono}>{preview.total}</span> found,{' '}
                    <span className={styles.inputMono}>{preview.accepted}</span> pass the URL filters.
                  </p>
                  <ul className={styles.previewList}>
                    {preview.rows.map((row) => (
                      <li
                        key={row.url}
                        className={`${styles.previewRow} ${row.accepted ? '' : styles.previewRowRejected}`}
                      >
                        <span className={styles.previewVerdict} aria-hidden="true">
                          {row.accepted ? <Check size={13} strokeWidth={2} /> : <X size={13} strokeWidth={2} />}
                        </span>
                        <span className={styles.previewBody}>
                          <span className={styles.previewTitle}>
                            {row.title ?? 'Untitled'}
                            {row.followsHop && <span className={styles.previewHop}>one hop</span>}
                          </span>
                          <span className={styles.previewUrl}>{row.url}</span>
                        </span>
                        {row.publishedAt && <span className={styles.previewDate}>{row.publishedAt}</span>}
                      </li>
                    ))}
                  </ul>
                  {preview.total > preview.rows.length && (
                    <p className={styles.hint}>
                      Showing the first {preview.rows.length}. Nothing was downloaded — this is a preview only.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>URL filters</label>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label}>Must match</label>
                <textarea
                  className={`${styles.input} ${styles.inputMono}`}
                  rows={2}
                  value={values.url_must_match}
                  onChange={(e) => update('url_must_match', e.target.value)}
                  placeholder={'\\.pdf$\n/reports/'}
                />
                <span className={styles.hint}>Regular expressions, one per line. A URL matching any of them is kept.</span>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Must not match</label>
                <textarea
                  className={`${styles.input} ${styles.inputMono}`}
                  rows={2}
                  value={values.url_must_not_match}
                  onChange={(e) => update('url_must_not_match', e.target.value)}
                  placeholder={'/tag/\n/author/'}
                />
                <span className={styles.hint}>A URL matching any of these is rejected, whatever else it matched.</span>
              </div>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Redistribution</label>
            <div className={styles.segmented} role="radiogroup" aria-label="Redistribution">
              {REDISTRIBUTION_OPTIONS.map((opt) => {
                const active = values.redistribution_default === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`${styles.segment} ${active ? styles.segmentActive : ''}`}
                    onClick={() => update('redistribution_default', opt.value)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <span className={styles.hint}>
              {REDISTRIBUTION_OPTIONS.find((o) => o.value === values.redistribution_default)?.hint}
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Licence notes</label>
            <textarea
              className={styles.input}
              rows={2}
              value={values.licence_notes}
              onChange={(e) => update('licence_notes', e.target.value)}
              placeholder="Attribution required. No redistribution of full documents."
            />
            <span className={styles.hint}>Terms of use, attribution requirements, known restrictions.</span>
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
              <label className={styles.label}>Crawl delay (seconds)</label>
              <input
                className={`${styles.input} ${styles.inputMono}`}
                type="number"
                min={0}
                max={120}
                value={values.crawl_delay_seconds}
                onChange={(e) => update('crawl_delay_seconds', Number(e.target.value) || 0)}
              />
              <span className={styles.hint}>The publisher&rsquo;s own robots.txt delay wins if it is longer.</span>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Candidates per run</label>
              <input
                className={`${styles.input} ${styles.inputMono}`}
                type="number"
                min={1}
                max={200}
                value={values.max_candidates_per_run}
                onChange={(e) => update('max_candidates_per_run', Number(e.target.value) || 1)}
              />
              <span className={styles.hint}>Newest first. A large backlog is worked through over several days.</span>
            </div>
          </div>

          {/* The money switch. Default off; an honest warning line when on. */}
          <div className={styles.moneySwitch}>
            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={values.ocr_enabled}
                onChange={(e) => update('ocr_enabled', e.target.checked)}
              />
              <span className={styles.switchTrack} aria-hidden="true">
                <span className={styles.switchThumb} />
              </span>
              <span className={styles.switchLabel}>Read scanned pages with OCR</span>
            </label>
            {values.ocr_enabled && (
              <>
                <p className={styles.moneyWarning}>
                  OCR is billed per page. It runs only on pages whose text layer is missing or unreadable, so a
                  typeset PDF never costs anything.
                </p>
                <div className={styles.field}>
                  <label className={styles.label}>Page limit per document</label>
                  <input
                    className={`${styles.input} ${styles.inputMono}`}
                    type="number"
                    min={1}
                    max={500}
                    value={values.ocr_page_limit}
                    onChange={(e) => update('ocr_page_limit', Number(e.target.value) || 1)}
                  />
                  <span className={styles.hint}>
                    Pages past the limit are recorded as not extracted rather than dropped silently.
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Article-feed and podcast share the feed-URL fields. */}
      {!isYoutube && !isEmail && !isReportWatch && (
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
