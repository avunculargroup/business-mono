import styles from './PageSkeleton.module.css';

export type SkeletonVariant = 'table' | 'detail' | 'cards';

interface PageSkeletonProps {
  /** Shape of the placeholder — match it to the page that's loading. */
  variant?: SkeletonVariant;
  /** Toolbar (title + action) placeholder. Used by `table` and `cards`. */
  hasToolbar?: boolean;
  /** Header bar placeholder (back link + title). Used by `detail`. */
  hasHeader?: boolean;
  /** Row count for `table`, field count for `detail`. */
  rows?: number;
  /** Tile count for `cards`. */
  cards?: number;
}

export function PageSkeleton({
  variant = 'table',
  hasToolbar = true,
  hasHeader = true,
  rows = 6,
  cards = 6,
}: PageSkeletonProps) {
  if (variant === 'detail') {
    return (
      <div className={styles.page} role="status" aria-label="Loading" aria-busy="true" data-variant="detail">
        {hasHeader && (
          <div className={styles.header} data-testid="skeleton-header">
            <div className={styles.headerBack} />
            <div className={styles.headerTitle} />
          </div>
        )}
        <div className={styles.detail}>
          <aside className={styles.profile}>
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className={styles.field} data-testid="skeleton-field">
                <div className={styles.fieldLabel} />
                <div className={styles.fieldValue} />
              </div>
            ))}
          </aside>
          <div className={styles.detailMain}>
            <div className={styles.sectionTitle} />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={styles.card} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'cards') {
    return (
      <div className={styles.page} role="status" aria-label="Loading" aria-busy="true" data-variant="cards">
        {hasToolbar && (
          <div className={styles.toolbar} data-testid="skeleton-toolbar">
            <div className={styles.titleBlock} />
            <div className={styles.buttonBlock} />
          </div>
        )}
        <div className={styles.cards}>
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className={styles.cardTile} data-testid="skeleton-card">
              <div className={styles.cardTileTitle} />
              <div className={styles.cardTileLine} />
              <div className={styles.cardTileLineShort} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page} role="status" aria-label="Loading" aria-busy="true" data-variant="table">
      {hasToolbar && (
        <div className={styles.toolbar} data-testid="skeleton-toolbar">
          <div className={styles.titleBlock} />
          <div className={styles.buttonBlock} />
        </div>
      )}
      <div className={styles.content}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={styles.row} data-testid="skeleton-row">
            <div className={`${styles.cell} ${styles.cellPrimary}`} />
            <div className={`${styles.cell} ${styles.cellSecondary}`} />
            <div className={`${styles.cell} ${styles.cellMeta}`} />
            <div className={`${styles.cell} ${styles.cellMeta}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
