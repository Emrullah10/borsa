-- Faz 0.3 (ölçüm onarımı, B13 düzeltmesi): "zombi pending" satırları temizle.
--
-- Sorun: signal_repository.js getPendingOutcomes() yaş sınırı olmadan TÜM
-- pending/active satırları döndürüyordu. Haziran'dan kalma sinyaller Ağustos
-- mumlarıyla eşleşip sim_entry_price yazıyordu (%4.97 ortalama sapma — B2).
-- Ölçülen ortalama çözülme süresi 27.93 saat çıkmıştı (timeout 4 saat olmasına
-- rağmen).
--
-- Bu migration additive/idempotent: (1) mevcut 6 saatten eski pending/active
-- satırları tek seferlik 'cancelled' olarak işaretler (yeniden kullanılabilir
-- enum değeri — yeni enum değeri eklemek yerine), notes alanına sebep yazılır.
-- (2) Kod tarafındaki sorgu (signal-repository.js) bundan böyle 6 saatten eski
-- satırları zaten sorgu seviyesinde eleyecek — bu migration sadece birikmiş
-- geçmişi temizler.

UPDATE signal_outcomes o
SET status = 'cancelled',
    resolved_at = now(),
    notes = COALESCE(notes || ' | ', '') || 'zombie-pending-cleanup:2026-08-29 (B13 — 6 saatten eski pending, gerçek çözüm bulunamadı)'
FROM signals s
WHERE o.signal_id = s.id
  AND o.status IN ('pending', 'active')
  AND s.created_at < now() - interval '6 hours';
