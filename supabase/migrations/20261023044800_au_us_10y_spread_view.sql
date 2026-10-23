-- ── AU–US 10-year spread, computed ───────────────────────────────────────────
--
-- Spec: docs/features/economic-indicators/abs-activation-spec.md
--
-- Derived, not stored: no registry row, no observations. Joins the current AU
-- 10Y and US 10Y prints on period_date and returns AU minus US in percentage
-- points. Days when only one market traded drop out of the inner join, which is
-- correct — a spread needs both legs on the same day.
--
-- Empty until AU 10Y is activated; both legs are daily rows.

CREATE OR REPLACE VIEW v_au_us_10y_spread
WITH (security_invoker = true) AS
SELECT au.period_date,
       au.value            AS au_10y,
       us.value            AS us_10y,
       au.value - us.value AS spread_pp
FROM indicator_observations au
JOIN economic_indicators eau ON eau.id = au.indicator_id AND eau.short_label = 'AU 10Y'
JOIN indicator_observations us ON us.period_date = au.period_date AND us.is_current
JOIN economic_indicators eus ON eus.id = us.indicator_id AND eus.short_label = 'US 10Y'
WHERE au.is_current
ORDER BY au.period_date DESC;
