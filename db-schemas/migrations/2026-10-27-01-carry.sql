-- Funding Carry (2026-10-27): kâğıt/canlı delta-nötr defter, funding defteri, risk olayları, günlük özsermaye.
-- İdempotent. Uygula: psql "$DATABASE_URL" -f db-schemas/migrations/2026-10-27-01-carry.sql

CREATE TABLE IF NOT EXISTS carry_positions (
  id            BIGSERIAL PRIMARY KEY,
  mode          VARCHAR(8)     NOT NULL DEFAULT 'paper',   -- paper | live
  symbol        VARCHAR(20)    NOT NULL,
  qty           NUMERIC(28,12) NOT NULL,                   -- spot LONG adedi = perp SHORT adedi
  notional_usd  NUMERIC(14,4)  NOT NULL,
  entry_apr     NUMERIC(12,6),
  opened_at     BIGINT         NOT NULL,
  entry_spot    NUMERIC(28,12) NOT NULL,
  entry_perp    NUMERIC(28,12) NOT NULL,
  entry_fees    NUMERIC(14,6)  NOT NULL,
  status        VARCHAR(8)     NOT NULL DEFAULT 'open',    -- open | closed
  closed_at     BIGINT,
  exit_spot     NUMERIC(28,12),
  exit_perp     NUMERIC(28,12),
  exit_fees     NUMERIC(14,6),
  close_reason  VARCHAR(32)
);
-- Aynı modda bir coinde en fazla bir açık pozisyon.
CREATE UNIQUE INDEX IF NOT EXISTS carry_positions_one_open ON carry_positions (mode, symbol) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS carry_funding_ledger (
  position_id BIGINT         NOT NULL REFERENCES carry_positions(id),
  ts          BIGINT         NOT NULL,                     -- ödeme anı (Bitget fundingTime)
  rate        NUMERIC(14,10) NOT NULL,
  mark_price  NUMERIC(28,12) NOT NULL,
  amount_usd  NUMERIC(14,6)  NOT NULL,                     -- short bacak için +: alınan
  PRIMARY KEY (position_id, ts)
);

CREATE TABLE IF NOT EXISTS carry_state (
  key        VARCHAR(64) PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Görülen HER duyuru (none dahil) yazılır → tekrar değerlendirilmez.
CREATE TABLE IF NOT EXISTS carry_risk_events (
  ann_id        VARCHAR(32) PRIMARY KEY,
  ann_title     TEXT        NOT NULL,
  ann_url       TEXT,
  ann_time      BIGINT,
  symbols       TEXT[]      NOT NULL DEFAULT '{}',
  severity      VARCHAR(8)  NOT NULL,
  rule_severity VARCHAR(8)  NOT NULL,
  ai_severity   VARCHAR(8),
  summary_tr    TEXT,
  ai_model      VARCHAR(80),
  ai_cost_usd   NUMERIC(12,8),
  created_at    BIGINT      NOT NULL
);

CREATE TABLE IF NOT EXISTS carry_daily_equity (
  mode           VARCHAR(8)    NOT NULL,
  day            BIGINT        NOT NULL,
  equity_usd     NUMERIC(14,4) NOT NULL,
  funding_usd    NUMERIC(14,6) NOT NULL,
  open_positions INT           NOT NULL,
  PRIMARY KEY (mode, day)
);

-- Son kararın aday listesi (panel "fırsatlar" tablosu).
CREATE TABLE IF NOT EXISTS carry_opportunities (
  day            BIGINT        NOT NULL,
  symbol         VARCHAR(20)   NOT NULL,
  apr            NUMERIC(12,6) NOT NULL,
  current_rate   NUMERIC(14,10),
  interval_hours INT,
  spot_volume    NUMERIC(20,2),
  perp_volume    NUMERIC(20,2),
  PRIMARY KEY (day, symbol)
);
