-- Faz 1.5 (kalıcı mum deposu): kaydedilmiş geçmiş OHLCV verisi.
--
-- NEDEN VAR: db-schemas'ta candle tablosu yoktu — market-data servisi mumları
-- sadece Redis'e yazıyordu (candles:{symbol}:{tf} listesi, MAX_CANDLES=60 ile
-- kırpılıyor, kalıcılık yok). Backtest/sweep her çalıştırmada Bitget REST'ten
-- SIFIRDAN veri çekiyordu — hem yavaş (sweep'te 27 combo × 5 sembol × onbinlerce
-- istek), hem tekrarlanabilir değil, hem de ML eğitim seti için kullanılabilir
-- tarihsel feature verisi hiç birikmiyordu. Ayrıca REST fırtınası sunucuda 88°C
-- termal kapanmaya ve Redis'in ölmesine yol açmıştı (bkz. plan Faz 1.5 notu).
--
-- (symbol, tf, ts) birincil anahtarı upsert'i doğal kılar — aynı mum tekrar
-- çekilirse ON CONFLICT DO UPDATE ile üzerine yazılır (kapanmamış mum kapanınca
-- güncellenmiş OHLC'yi yansıtır).
CREATE TABLE IF NOT EXISTS candles (
  symbol  VARCHAR(20)  NOT NULL,
  tf      timeframe    NOT NULL,
  ts      BIGINT       NOT NULL,
  open    NUMERIC(20, 8) NOT NULL,
  high    NUMERIC(20, 8) NOT NULL,
  low     NUMERIC(20, 8) NOT NULL,
  close   NUMERIC(20, 8) NOT NULL,
  volume  NUMERIC(28, 8) NOT NULL,
  PRIMARY KEY (symbol, tf, ts)
);

-- Backtest/sweep erişim deseni: sembol+tf için zaman aralığı sorgusu, artan ts.
CREATE INDEX IF NOT EXISTS idx_candles_symbol_tf_ts ON candles(symbol, tf, ts);
