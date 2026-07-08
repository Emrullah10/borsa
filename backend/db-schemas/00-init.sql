CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 'neutral' = baski/yon yok; signals.direction icin kullanilmaz (subscriber isCandidate ile eler),
-- yalnizca liq_direction gibi "yon hesaplandi ama net degil" durumlari icin gecerlidir.
CREATE TYPE signal_direction AS ENUM ('long', 'short', 'neutral');
CREATE TYPE signal_status AS ENUM ('pending', 'active', 'tp_hit', 'sl_hit', 'timeout', 'cancelled');
CREATE TYPE timeframe AS ENUM ('1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d');
