// Saf fonksiyon — DB/Redis bağımlılığı yok, kolayca test edilir

/**
 * Açık bir outcome için mum OHLC'ye göre sonuç değerlendir.
 * candle = { open, high, low, close }
 *
 * Aynı mumda hem SL hem TP range'i içindeyse SL önce geldi varsayılır —
 * scalp stopu tighttır ve konservatif olmak win-rate'i şişirmez.
 *
 * @returns {{ status, exitPrice, pnlR } | null}  null = sinyal hâlâ açık
 */
export function evaluateOutcome(signal, candle, now = Date.now(), timeoutMs = 4 * 60 * 60 * 1000) {
  const { direction, entry_price, stop_price, target_price, signal_created_at } = signal;
  const entry  = parseFloat(entry_price);
  const stop   = parseFloat(stop_price);
  const target = parseFloat(target_price);
  const risk   = Math.abs(entry - stop);

  const isLong = direction === 'long';
  const { high, low, close } = candle;

  const tpHit = isLong ? high >= target  : low  <= target;
  const slHit = isLong ? low  <= stop    : high >= stop;

  // SL öncelikli tie-break: aynı mumda ikisi de gerçekleştiyse SL kabul et
  if (slHit) {
    return { status: 'sl_hit', exitPrice: stop, pnlR: -1, ...(tpHit ? { tieBreak: true } : {}) };
  }
  if (tpHit) {
    const pnlR = risk > 0 ? Math.abs(target - entry) / risk : 0;
    return { status: 'tp_hit', exitPrice: target, pnlR: +pnlR.toFixed(4) };
  }

  const age = now - new Date(signal_created_at).getTime();
  if (age > timeoutMs) {
    const pnlR = risk > 0 ? ((isLong ? 1 : -1) * (close - entry)) / risk : 0;
    return { status: 'timeout', exitPrice: close, pnlR: +pnlR.toFixed(4) };
  }

  return null; // hâlâ açık
}

/**
 * Paper-trading: gerçekçi sim giriş fiyatına göre R hesapla.
 * simEntry = sinyalden sonraki ilk 1m mumun açılışı ± slippage (tracker'da hesaplanır).
 * Stop/target mutlak fiyatlar sinyaldeki gibi kalır; risk sim girişe göre yeniden ölçülür.
 * Round-trip taker fee, R cinsine çevrilip düşülür.
 *
 * @returns {{ simPnlR: number|null }}
 */
export function evaluateSimOutcome({ direction, simEntry, stopPrice, targetPrice, status, exitPrice, takerFee }) {
  if (simEntry == null) return { simPnlR: null };

  const isLong = direction === 'long';
  const simRisk = Math.abs(simEntry - stopPrice);
  if (simRisk <= 0) return { simPnlR: null };

  const grossR = ((isLong ? 1 : -1) * (exitPrice - simEntry)) / simRisk;
  const feeR = (2 * takerFee * simEntry) / simRisk;

  return { simPnlR: +(grossR - feeR).toFixed(4) };
}
