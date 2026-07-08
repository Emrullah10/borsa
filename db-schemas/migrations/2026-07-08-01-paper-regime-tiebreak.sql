-- Additive, idempotent migration: paper-trading, backtest regime parity, tie-break logging.
ALTER TABLE signals ADD COLUMN IF NOT EXISTS regime VARCHAR(10);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS higher_tf_trend VARCHAR(10);
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS sim_entry_price NUMERIC(20, 8);
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS sim_pnl_r NUMERIC(8, 4);
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS tie_break BOOLEAN NOT NULL DEFAULT false;

INSERT INTO bot_config (key, value) VALUES
  ('taker_fee', '0.0006'),
  ('slippage_pct', '0.0003'),
  ('sim_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
