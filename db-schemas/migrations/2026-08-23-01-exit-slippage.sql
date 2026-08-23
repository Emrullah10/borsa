-- Faz 0.1 — Çıkış kayması (exit slippage) modeli
--
-- Gerekçe: evaluateSimOutcome çıkışı her zaman TAM stop/target fiyatından
-- dolduruyordu. Gerçekte stop tetiklenince fiyat seviyeden GEÇER (stop-through)
-- ve market emriyle daha kötü dolar. Bu kayma sadece KAYBEDEN tarafa vurduğu
-- için modellenmediğinde ölçülen edge sistematik olarak YUKARI sapıyordu.
--
-- TP limit emirle dolduğu için kayma uygulanmaz; timeout market kapanışı olduğu
-- için uygulanır. Detay: core/service-tracker/src/domain/evaluate-outcome.js
--
-- Ölçülen etki (n=99, 2 günlük temiz veri): avg_sim_r +0.0370 → +0.0324 R.
-- Edge pozitif kalıyor (geniş %2.5 stop sayesinde), ama artık dürüst ölçülüyor.

INSERT INTO bot_config (key, value) VALUES
  ('exit_slippage_pct', '0.0003')
ON CONFLICT (key) DO NOTHING;
