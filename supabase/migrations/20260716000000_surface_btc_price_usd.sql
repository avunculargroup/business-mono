-- ── Surface BTC/USD ──────────────────────────────────────────────────────────
-- btc_price_usd (Coin Metrics PriceUSD daily close) was seeded is_displayed=false
-- in 20260708000000_add_btc_trend_valuation.sql — a raw input feeding the
-- trend_valuation metrics (moving averages, Mayer Multiple) and MVRV, never shown
-- on its own. Flip it visible so its stored series renders on the dashboard's
-- Trend & Valuation panel alongside the metrics derived from it.
--
-- metric_group stays trend_valuation. In the market_report routine, btc_price_usd
-- is placed in the Bitcoin snapshot section (live-fetched, directly below
-- BTC/AUD) via an explicit key list, and excluded from the report's
-- Trend & Valuation section so it renders exactly once — see runMarketReport.ts.
UPDATE onchain_indicators
  SET is_displayed = true
  WHERE key = 'btc_price_usd';
