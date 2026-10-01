-- Lab (2026-09-30): funding oranı geçmişi. Bitget yalnız ~90 gün saklıyor —
-- kaydedilmeyen veri kalıcı olarak kaybolur; Binance yıllarca geriye veriyor.
-- (source, symbol, ts) anahtarı iki kaynağı yan yana tutar; korelasyon (~0.58, SOL)
-- ve vekil kullanımı raporda görünsün diye kaynak silinmez, birleştirilmez.
CREATE TABLE IF NOT EXISTS funding_rates (
  source  VARCHAR(10)    NOT NULL,   -- 'bitget' | 'binance'
  symbol  VARCHAR(20)    NOT NULL,
  ts      BIGINT         NOT NULL,   -- funding ödeme anı (ms)
  rate    NUMERIC(14, 10) NOT NULL,  -- dönem başına oran (0.0001 = %0.01)
  PRIMARY KEY (source, symbol, ts)
);
CREATE INDEX IF NOT EXISTS idx_funding_symbol_ts ON funding_rates(symbol, ts);
