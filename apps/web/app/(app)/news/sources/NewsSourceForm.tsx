'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import styles from './sources.module.css';

export interface NewsSourceFormValues {
  name: string;
  site_url: string;
  feed_url: string;
  is_active: boolean;
}

const DEFAULTS: NewsSourceFormValues = {
  name: '',
  site_url: '',
  feed_url: '',
  is_active: true,
};

interface Props {
  initialValues?: NewsSourceFormValues;
  onSubmit: (values: NewsSourceFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}

export function NewsSourceForm({ initialValues, onSubmit, onCancel, submitting }: Props) {
  const [values, setValues] = useState<NewsSourceFormValues>(initialValues ?? DEFAULTS);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof NewsSourceFormValues>(key: K, val: NewsSourceFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!values.name.trim()) {
      setError('Name is required.');
      return;
    }
    const isSubstack = /(^|\.)substack\.com/i.test(values.site_url.trim());
    if (!values.feed_url.trim() && !isSubstack) {
      setError('Enter a feed URL (RSS/Atom), or a Substack site URL so the feed can be derived.');
      return;
    }
    onSubmit({
      name: values.name.trim(),
      site_url: values.site_url.trim(),
      feed_url: values.feed_url.trim(),
      is_active: values.is_active,
    });
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {error && <div className={styles.formError}>{error}</div>}

      <div className={styles.field}>
        <label className={styles.label}>Name</label>
        <input
          className={styles.input}
          value={values.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="Bitcoin Magazine"
          required
        />
      </div>

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

      <div className={styles.field}>
        <label className={styles.label}>Feed URL</label>
        <input
          className={styles.input}
          type="url"
          value={values.feed_url}
          onChange={(e) => update('feed_url', e.target.value)}
          placeholder="https://bitcoinmagazine.com/feed"
        />
        <span className={styles.hint}>The RSS or Atom feed scanned for new articles. Required for non-Substack sources.</span>
      </div>

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
          {initialValues ? 'Save changes' : 'Add source'}
        </Button>
      </div>
    </form>
  );
}
