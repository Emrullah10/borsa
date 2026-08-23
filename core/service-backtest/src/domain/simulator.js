import { evaluateOutcome, evaluateSimOutcome } from '@borsa-bot/core-tracker/src/domain/evaluate-outcome.js';

const MAX_CANDLES = 240;
const CANDLE_MS = 60 * 1000;
// 240 × 1m = 4h, core/service-tracker'ın varsayılan timeoutMs'iyle aynı (evaluate-outcome.js).
const TIMEOUT_MS = MAX_CANDLES * CANDLE_MS;

// Parite düzeltmesi (2026-08-20): önceden bu fonksiyon kendi TP/SL/timeout mantığını
// taşıyordu — fee/slippage yoktu, giriş fiyatı setup.entryPrice'tı (mum kapanışı),
// TP/SL beraberliğinde TP kazanıyordu, timeout'ta r=0 varsayılıyordu. Canlı
// core/service-tracker/src/domain/evaluate-outcome.js ise girişi sonraki mumun
// açılışı±slippage alıyor, SL-first tie-break yapıyor, fee'yi R'ye çeviriyordu.
// Artık aynı saf fonksiyonlar çağrılıyor — parite kod düzeyinde garanti.
export function simulateTrade(setup, candles, fees = {}) {
  const { entryPrice, stopPrice, targetPrice, direction } = setup;
  const { takerFee = 0.0006, slippagePct = 0.0003, exitSlippagePct = 0.0003 } = fees;

  const window = candles.slice(0, MAX_CANDLES);
  if (window.length === 0) {
    return { outcome: 'TIMEOUT', r: 0, durationMinutes: 0 };
  }

  // Canlı make-process-outcome-candle.js:43 ile aynı: giriş = sonraki mumun açılışı ± slippage
  const isLong = direction === 'long';
  const simEntry = window[0].open * (isLong ? 1 + slippagePct : 1 - slippagePct);

  const signal = {
    direction,
    entry_price: entryPrice,
    stop_price: stopPrice,
    target_price: targetPrice,
    signal_created_at: new Date(0).toISOString(),
  };

  for (let i = 0; i < window.length; i++) {
    const candle = window[i];
    const now = (i + 1) * CANDLE_MS;
    const result = evaluateOutcome(signal, candle, now, TIMEOUT_MS);
    if (!result) continue;

    const { simPnlR } = evaluateSimOutcome({
      direction,
      simEntry,
      stopPrice,
      targetPrice,
      status: result.status,
      exitPrice: result.exitPrice,
      takerFee,
      exitSlippagePct,
    });

    const outcome = result.status === 'tp_hit' ? 'WIN' : result.status === 'sl_hit' ? 'LOSS' : 'TIMEOUT';
    return {
      outcome,
      r: simPnlR ?? 0,
      durationMinutes: i + 1,
      ...(result.tieBreak ? { tieBreak: true } : {}),
    };
  }

  return { outcome: 'TIMEOUT', r: 0, durationMinutes: window.length };
}
