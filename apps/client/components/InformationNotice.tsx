import styles from './InformationNotice.module.css';

/**
 * The standing information-only notice.
 *
 * Rendered once in the authenticated layout, never per route. A notice added
 * per route is a notice eventually forgotten on a route, and the route it gets
 * forgotten on will be the new one nobody reviewed.
 *
 * Deliberately **not** a "general advice warning". That phrase implies licensed
 * general advice, which is a different thing from factual information: BTS does
 * not give financial advice and holds no AFS authorisation. Naming it correctly
 * is not pedantry — a warning that claims a licence you do not hold is worse
 * than no warning, because it asserts something untrue about the service.
 *
 * The text is hard-coded rather than read from `compliance_documents`. It is
 * two sentences, it must render even when the database is unreachable, and a
 * notice that can fail to load is a notice that is sometimes absent. The
 * Service Statement it points at is the document behind the gate, and that one
 * does come from the library.
 */
export function InformationNotice() {
  return (
    <aside className={styles.notice} aria-label="Information-only notice">
      <p>
        Minute provides factual information and does not provide financial advice. Nothing
        here takes account of your objectives, financial situation or needs, and nothing here
        is a recommendation to acquire, hold or dispose of anything. Bitcoin Treasury
        Solutions holds no client assets and is paid by subscribers only.
      </p>
    </aside>
  );
}
