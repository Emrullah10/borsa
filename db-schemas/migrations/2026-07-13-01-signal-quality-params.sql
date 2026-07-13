-- Additive/idempotent: sinyal kalitesi iyileştirme parametreleri.
-- 2026-07-13 kırılım analizi + 5 turluk backtest sweep sonucu (bkz. .wolf/cerebrum.md):
-- gerçek sinyal evreninde (canlıda fiilen işlem gören altcoin sembolleri) en iyi
-- kombinasyon: confluence_threshold=0.70, atr_stop_mult=1.5, target_rr=1.2,
-- require_sr_cap=true → backtest'te %54.7 WR, PF 1.33, AvgR +0.149 (önceki: %37.8 WR).
UPDATE bot_config SET value = '0.70', updated_at = now() WHERE key = 'confluence_threshold';

INSERT INTO bot_config (key, value) VALUES
  ('atr_stop_mult', '1.5'),
  ('target_rr', '1.2'),
  ('require_sr_cap', 'true'),
  ('adx_max', '65'),
  ('max_pb_long', '0.85'),
  ('min_pb_short', '0.15'),
  ('rsi_max_long', '70'),
  ('rsi_min_short', '30')
ON CONFLICT (key) DO NOTHING;
