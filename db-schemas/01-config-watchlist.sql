CREATE TABLE IF NOT EXISTS watchlist (
  id          SERIAL PRIMARY KEY,
  symbol      VARCHAR(20) NOT NULL UNIQUE,
  active      BOOLEAN NOT NULL DEFAULT true,
  timeframes  TEXT[] NOT NULL DEFAULT '{1m,5m,15m}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bot_config (
  key         VARCHAR(100) PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO watchlist (symbol) VALUES ('BTCUSDT'), ('ETHUSDT')
ON CONFLICT (symbol) DO NOTHING;

INSERT INTO bot_config (key, value) VALUES
  ('confluence_threshold', '0.80'),
  ('ai_confidence_threshold', '0.70'),
  ('ai_enabled', 'true'),
  ('ai_cooldown_seconds', '30'),
  ('rr_min', '1.0'),
  ('taker_fee', '0.0006'),
  ('slippage_pct', '0.0003'),
  ('sim_enabled', 'true'),
  ('atr_stop_mult', '2.5'),
  ('target_rr', '1.2'),
  ('require_sr_cap', 'true'),
  ('adx_max', '65'),
  ('max_pb_long', '0.85'),
  ('min_pb_short', '0.15'),
  ('rsi_max_long', '70'),
  ('rsi_min_short', '30')
ON CONFLICT (key) DO NOTHING;
