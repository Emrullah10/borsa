-- 2026-08-20: Strateji parametre tuning
-- Teşhis: günde ~666 sinyal, %41.9 WR, fee > edge → net kayıp.
-- Değişiklikler:
--   confluence_threshold: 0.70 → 0.80 (daha az ama kaliteli sinyal)
--   atr_stop_mult: 1.5 → 2.5 (geniş stop = gürültü kayıplarını azalt)
--   rr_min: 1.5 → 1.0 (S/R cap sonrası düşük RR sinyaller hâlâ geçerli)

UPDATE bot_config SET value = '0.80', updated_at = now() WHERE key = 'confluence_threshold';
UPDATE bot_config SET value = '2.5',  updated_at = now() WHERE key = 'atr_stop_mult';
UPDATE bot_config SET value = '1.0',  updated_at = now() WHERE key = 'rr_min';
