import styles from './GeneralAdviceWarning.module.css';

/**
 * The standing general advice warning.
 *
 * Rendered once in the authenticated layout, never per route. A warning added
 * per route is a warning eventually forgotten on a route, and the route it gets
 * forgotten on will be the new one nobody reviewed.
 *
 * Rule 3 of the compliance architecture: disclosure is a blocking gate, not a
 * footer — but the standing warning is the part that stays visible afterwards,
 * so it sits in the chrome rather than at the bottom of the page.
 *
 * The text is deliberately hard-coded rather than read from
 * `compliance_documents`. It is one sentence, it must render even when the
 * database is unreachable, and a warning that can fail to load is a warning
 * that is sometimes absent. The FSG it refers to is the document behind the
 * gate, and that one does come from the library.
 */
export function GeneralAdviceWarning() {
  return (
    <aside className={styles.warning} aria-label="General advice warning">
      <p>
        Minute provides general information only. Nothing here takes account of your
        objectives, financial situation or needs, and nothing here is a recommendation to
        acquire, hold or dispose of any product. Consider your own circumstances, and the
        relevant disclosure documents, before making any decision.
      </p>
    </aside>
  );
}
