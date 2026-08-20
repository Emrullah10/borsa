-- Additive, idempotent migration: Faz 3 execution doğrulama (borsa-strategy-validation-plan).
-- Amaç istatistiksel edge kanıtı değil — gerçek dolum fiyatının sistemin
-- sim_entry_price'ıyla ne kadar uyuştuğunu ölçmek (slippage modeli doğru mu?).
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS real_entry_price NUMERIC(20, 8);
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS real_exit_price NUMERIC(20, 8);
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS real_entry_at TIMESTAMPTZ;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS real_notes TEXT;
