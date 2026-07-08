import { evaluateOutcome, evaluateSimOutcome } from '../../domain/evaluate-outcome.js';

export function makeProcessOutcomeCandle({ signalRepo, publish, log, timeoutMs, fees }) {
  const { takerFee, slippagePct } = fees ?? { takerFee: 0.0006, slippagePct: 0.0003 };
  // pendingBySymbol: { BTCUSDT: [ outcome, ... ] }
  let pendingBySymbol = {};
  // Çözümlenen outcome_id'leri tut — refresh sırasında tekrar yüklenmesini önler
  const resolvedIds = new Set();

  async function refreshPending() {
    try {
      const rows = await signalRepo.getPendingOutcomes();
      pendingBySymbol = {};
      for (const row of rows) {
        if (resolvedIds.has(row.outcome_id)) continue; // zaten çözümlendi, atla
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
