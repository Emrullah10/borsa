CREATE TABLE IF NOT EXISTS signals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol              VARCHAR(20) NOT NULL,
  direction           signal_direction NOT NULL,
  trigger_timeframe   timeframe NOT NULL,
  entry_price         NUMERIC(20, 8) NOT NULL,
  stop_price          NUMERIC(20, 8) NOT NULL,
  target_price        NUMERIC(20, 8) NOT NULL,
  rr_ratio            NUMERIC(6, 3) NOT NULL,
  confluence_score    NUMERIC(5, 4) NOT NULL,
  ai_approved         BOOLEAN,
  ai_confidence       NUMERIC(5, 4),
  ai_reason           TEXT,
  indicators_snapshot JSONB NOT NULL,
  liq_pressure_score  NUMERIC(5, 4),
  liq_direction       signal_direction,
  regime              VARCHAR(10),
  higher_tf_trend     VARCHAR(10),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signal_outcomes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id       UUID NOT NULL REFERENCES signals(id),
  status          signal_status NOT NULL DEFAULT 'pending',
  exit_price      NUMERIC(20, 8),
  pnl_r           NUMERIC(8, 4),
  sim_entry_price NUMERIC(20, 8),
  sim_pnl_r       NUMERIC(8, 4),
  tie_break       BOOLEAN NOT NULL DEFAULT false,
  resolved_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_symbol_created ON signals(symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outcomes_signal_id ON signal_outcomes(signal_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_status ON signal_outcomes(status);
