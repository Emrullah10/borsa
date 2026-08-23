import { evaluateOutcome, evaluateSimOutcome } from '../../domain/evaluate-outcome.js';
import { backfillOutcome } from '../../domain/backfill-outcome.js';

// C4 düzeltmesi (2026-08-20): servis restart'ı gibi durumlarda tracker'ın candle
// akışını kaçırdığı outcome'lar sessizce timeout'a düşüyordu. sim_entry_price
// hâlâ null VE sinyal bu kadar eskiyse, kaçırılan pencereyi backfillOutcome ile
// geriye doğru oynat. fetchMissedCandles opsiyonel — verilmezse eski davranış
// (backfill yok) korunur, mevcut testler/entegrasyonlar bozulmaz.
const BACKFILL_MIN_AGE_MS = 2 * 60 * 1000;

export function makeProcessOutcomeCandle({ signalRepo, publish, log, timeoutMs, fees, fetchMissedCandles }) {
  const { takerFee, slippagePct, exitSlippagePct } = fees
    ?? { takerFee: 0.0006, slippagePct: 0.0003, exitSlippagePct: 0.0003 };
  // pendingBySymbol: { BTCUSDT: [ outcome, ... ] }
  let pendingBySymbol = {};
  // Çözümlenen outcome_id'leri tut — refresh sırasında tekrar yüklenmesini önler
  const resolvedIds = new Set();

  async function backfillRow(row, now) {
    try {
      const fromTs = new Date(row.signal_created_at).getTime();
      const candles = await fetchMissedCandles(row.symbol, fromTs);
      if (!candles?.length) return;

      const { simEntry, resolved } = backfillOutcome(row, candles, now, timeoutMs, { takerFee, slippagePct });

      if (simEntry != null && row.sim_entry_price == null) {
        row.sim_entry_price = simEntry;
        await signalRepo.setSimEntry(row.outcome_id, simEntry);
      }

      if (resolved) {
        resolvedIds.add(row.outcome_id);
        const notes = resolved.tieBreak ? 'tie-break: SL-first (backfill)' : 'backfill';
        await signalRepo.resolveOutcome(row.outcome_id, { ...resolved, notes });
        log.info(
          `📊 BACKFILL OUTCOME: ${row.symbol} ${row.direction.toUpperCase()}` +
          ` → ${resolved.status.toUpperCase()} (kaçırılan pencere telafi edildi)`,
        );
        await publish(
          'signals.resolved',
          JSON.stringify({ outcomeId: row.outcome_id, signalId: row.signal_id, symbol: row.symbol, ...resolved }),
        );
      }
    } catch (err) {
      log.error(`Tracker backfill error (${row.symbol}):`, err.message);
    }
  }

  async function refreshPending() {
    try {
      const rows = await signalRepo.getPendingOutcomes();
      pendingBySymbol = {};
      const now = Date.now();
      for (const row of rows) {
        if (resolvedIds.has(row.outcome_id)) continue; // zaten çözümlendi, atla

        if (fetchMissedCandles && row.sim_entry_price == null) {
          const age = now - new Date(row.signal_created_at).getTime();
          if (age >= BACKFILL_MIN_AGE_MS) {
            await backfillRow(row, now);
            if (resolvedIds.has(row.outcome_id)) continue; // backfill sırasında resolve oldu
          }
        }

        if (!pendingBySymbol[row.symbol]) pendingBySymbol[row.symbol] = [];
        pendingBySymbol[row.symbol].push(row);
      }
      log.debug(`Tracker: ${rows.length} açık outcome yüklendi`);
    } catch (err) {
      log.error('Tracker refresh error:', err.message);
    }
  }

  async function handleCandleMessage(msg, now = Date.now()) {
    if (msg.type !== 'candle') return;

    const { symbol, data } = msg;
    const outcomes = pendingBySymbol[symbol];
    if (!outcomes?.length) return;

    // Mum OHLC ilet — evaluateOutcome intra-candle high/low kullanır
    const candle = { open: data.open, high: data.high, low: data.low, close: data.close };

    for (const outcome of outcomes) {
      // Çift işlem koruması: zaten işleniyorsa atla
      if (resolvedIds.has(outcome.outcome_id)) continue;

      // Paper-trading: henüz sim giriş yakalanmadıysa bu mumun açılışını (± slippage) kullan.
      // Aynı mum hem sim entry'yi doldurabilir hem de resolve edebilir (sim entry evaluateOutcome'dan önce yazılır).
      if (outcome.sim_entry_price == null) {
        const isLong = outcome.direction === 'long';
        const simEntry = candle.open * (isLong ? 1 + slippagePct : 1 - slippagePct);
        outcome.sim_entry_price = simEntry;
        await signalRepo.setSimEntry(outcome.outcome_id, simEntry);
      }

      const result = evaluateOutcome(outcome, candle, now, timeoutMs);
      if (!result) continue;

      // Önce Set'e ekle — paralel candle mesajları aynı outcome'ı işlemesin
      resolvedIds.add(outcome.outcome_id);

      // Bellekten hemen kaldır
      pendingBySymbol[symbol] = pendingBySymbol[symbol].filter(
        o => o.outcome_id !== outcome.outcome_id,
      );

      const { simPnlR } = evaluateSimOutcome({
        direction: outcome.direction,
        simEntry: parseFloat(outcome.sim_entry_price),
        stopPrice: parseFloat(outcome.stop_price),
        targetPrice: parseFloat(outcome.target_price),
        status: result.status,
        exitPrice: result.exitPrice,
        takerFee,
        exitSlippagePct,
      });

      const notes = result.tieBreak ? 'tie-break: SL-first' : null;

      await signalRepo.resolveOutcome(outcome.outcome_id, { ...result, simPnlR, notes });

      log.info(
        `📊 OUTCOME: ${symbol} ${outcome.direction.toUpperCase()}` +
        ` → ${result.status.toUpperCase()} | exit:${result.exitPrice} | R:${result.pnlR}` +
        (simPnlR != null ? ` | simR:${simPnlR}` : ''),
      );

      await publish(
        'signals.resolved',
        JSON.stringify({ outcomeId: outcome.outcome_id, signalId: outcome.signal_id, symbol, ...result, simPnlR }),
      );
    }
  }

  return { refreshPending, handleCandleMessage };
}
