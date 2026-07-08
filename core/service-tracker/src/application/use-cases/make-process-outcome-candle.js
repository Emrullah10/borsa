import { evaluateOutcome } from '../../domain/evaluate-outcome.js';

export function makeProcessOutcomeCandle({ signalRepo, publish, log, timeoutMs }) {
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

      const result = evaluateOutcome(outcome, candle, now, timeoutMs);
      if (!result) continue;

      // Önce Set'e ekle — paralel candle mesajları aynı outcome'ı işlemesin
      resolvedIds.add(outcome.outcome_id);

      // Bellekten hemen kaldır
      pendingBySymbol[symbol] = pendingBySymbol[symbol].filter(
        o => o.outcome_id !== outcome.outcome_id,
      );

      await signalRepo.resolveOutcome(outcome.outcome_id, result);

      log.info(
        `📊 OUTCOME: ${symbol} ${outcome.direction.toUpperCase()}` +
        ` → ${result.status.toUpperCase()} | exit:${result.exitPrice} | R:${result.pnlR}`,
      );

      await publish(
        'signals.resolved',
        JSON.stringify({ outcomeId: outcome.outcome_id, signalId: outcome.signal_id, symbol, ...result }),
      );
    }
  }

  return { refreshPending, handleCandleMessage };
}
