import { getRepositories } from '@/lib/repositories';
import styles from './DemoChip.module.css';

/**
 * Marks a surface as fixture-backed, next to its heading.
 *
 * The banner says it once for the whole app; this says it again where a reader
 * is actually looking at numbers.
 *
 * It takes the label from the bundle's `mode` rather than hardcoding it, which
 * is the entire sanctioned use of that field: `mode` drives chrome and copy and
 * never behaviour. Reading it here also means a page mounted against a live
 * bundle would stop claiming to be a demo, instead of silently mislabelling
 * real data as invented — the failure that matters in this direction.
 */
const LABELS = {
  demo: 'Demo data',
  live: 'Live data',
  client: 'Client data',
} as const;

export function DemoChip() {
  const { mode } = getRepositories();

  return <span className={styles.chip}>{LABELS[mode]}</span>;
}
