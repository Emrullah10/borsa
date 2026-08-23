import { evaluateOutcome, evaluateSimOutcome } from './evaluate-outcome.js';

/**
 * Kaçırılmış (servis restart'ı gibi durumlarda tracker'ın canlı candle akışını
 * kaçırdığı) 1m mumları kronolojik sırayla oynatır — C4 düzeltmesi
 * (2026-08-20 doğrulama araştırması): backfill olmadan bu pencerede TP/SL
 * tamamen kaçırılıyor, sinyal sessizce timeout'a düşüyordu.
 *
 * @param {object} outcome - signal-shaped satır (direction, entry_price,
 *   stop_price, target_price, sim_entry_price, signal_created_at)
 * @param {Array<{timestamp, open, high, low, close}>} candles - kaçırılan
 *   1m mumlar, kronolojik sırada (signal_created_at sonrası)
 * @param {number} now
 * @param {number} timeoutMs
 * @param {{takerFee:number, slippagePct:number, exitSlippagePct?:number}} fees
 * @returns {{ simEntry: number|null, resolved: null | object }}
 */
export function backfillOutcome(outcome, candles, now, timeoutMs, fees) {
  const isLong = outcome.direction === 'long';
  let simEntry = outcome.sim_entry_price != null ? parseFloat(outcome.sim_entry_price) : null;

  for (const candle of candles) {
    if (simEntry == null) {
      simEntry = candle.open * (isLong ? 1 + fees.slippagePct : 1 - fees.slippagePct);
    }

    const result = evaluateOutcome(outcome, candle, candle.timestamp, timeoutMs);
    if (!result) continue;

    const { simPnlR } = evaluateSimOutcome({
      direction: outcome.direction,
      simEntry,
      stopPrice: parseFloat(outcome.stop_price),
      targetPrice: parseFloat(outcome.target_price),
      status: result.status,
      exitPrice: result.exitPrice,
      takerFee: fees.takerFee,
      exitSlippagePct: fees.exitSlippagePct,
    });

    return { simEntry, resolved: { ...result, simPnlR } };
  }

  return { simEntry, resolved: null };
}
