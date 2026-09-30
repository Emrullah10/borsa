// Lab (2026-09-30) — Tip 1 backtest motoru (funding uçları, tek coin).
// Mevcut simulateTrade + evaluateOutcome/evaluateSimOutcome paritesini kullanır (fee, kayma,
// SL-önce eşitlik). Ek olarak funding PnL'i R cinsinden eklenir.
import { calcATR } from '@borsa-bot/core-signal-engine/src/domain/indicators.js';
import { simulateTrade } from '../simulator.js';
import { feesForSimulator, sumFundingBetween, fundingPnlFraction } from './cost-model.js';

const HOUR = 3_600_000;
const ATR_PERIOD = 14;
const ATR_LOOKBACK = 60;         // ATR için giriş mumundan ÖNCEKİ mum sayısı
const FAR_TARGET_RISK_MULT = 50; // "hedefsiz": fiilen ulaşılamaz — çıkış = stop ya da zaman

// Artan sıralı mumlarda timestamp'i `ts`'den KESİN büyük ilk mumun indeksi (yoksa -1).
function firstIndexAfter(candles, ts) {
  let lo = 0; let hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (candles[mid].timestamp > ts) hi = mid; else lo = mid + 1;
  }
  return lo < candles.length ? lo : -1;
}

/**
 * @param {object} p
 * @param {string} p.symbol
 * @param {Array<{timestamp:number,direction:'long'|'short'}>} p.signals  kronolojik
 * @param {Array} p.candles1h      artan, {timestamp(açılış), open, high, low, close}
 * @param {Array<{timestamp:number,rate:number}>} p.fundingSeries  PnL için (Bitget varsa o, yoksa Binance)
 * @param {number} p.holdHours     sabit tutma süresi
 * @param {number} p.stopAtrMult   stop = giriş ∓ stopAtrMult × ATR(14, 1h)
 * @param {number} [p.rank]        hacim sırası (kayma katmanı: ilk 20 likit)
 * @param {number} [p.costMultiplier=1]  stres testi için 2
 */
export function runFundingStrategy({
  symbol, signals, candles1h, fundingSeries = [], holdHours, stopAtrMult, rank, costMultiplier = 1,
}) {
  const fees = feesForSimulator({ rank, costMultiplier });
  const trades = [];
  let busyUntil = -Infinity;

  for (const sig of signals) {
    if (sig.timestamp < busyUntil) continue; // pozisyon açıkken yeni sinyal yok

    // Giriş: sinyal anından SONRAKİ ilk 1h mumun açılışı (funding oranı o an kesinleşir,
    // 1 saat gecikme bilinçli ve temkinli).
    const entryIdx = firstIndexAfter(candles1h, sig.timestamp);
    if (entryIdx === -1) continue;
    if (entryIdx + holdHours > candles1h.length) continue; // tam tutma penceresi yok → bedava timeout üretme

    const prev = candles1h.slice(Math.max(0, entryIdx - ATR_LOOKBACK), entryIdx);
    if (prev.length < ATR_PERIOD + 1) continue;
    const atr = calcATR(prev.map((c) => c.high), prev.map((c) => c.low), prev.map((c) => c.close), ATR_PERIOD);
    if (!(atr > 0)) continue;

    const entryCandle = candles1h[entryIdx];
    const entry = entryCandle.open;
    const isLong = sig.direction === 'long';
    const risk = stopAtrMult * atr;
    const stop = isLong ? entry - risk : entry + risk;
    if (stop <= 0) continue; // ATR fiyata göre aşırı büyük — long stop negatife düşer
    const target = isLong ? entry + FAR_TARGET_RISK_MULT * risk : entry - FAR_TARGET_RISK_MULT * risk;

    const result = simulateTrade(
      { direction: sig.direction, entryPrice: entry, stopPrice: stop, targetPrice: target },
      candles1h.slice(entryIdx, entryIdx + holdHours),
      fees,
      { candleMs: HOUR, timeoutMs: holdHours * HOUR },
    );

    const exitTs = entryCandle.timestamp + result.durationMinutes * 60_000;
    const fundingFraction = fundingPnlFraction(sig.direction, sumFundingBetween(fundingSeries, entryCandle.timestamp, exitTs));
    const fundingR = (fundingFraction * entry) / risk; // notional kesri → R
    busyUntil = exitTs;

    trades.push({
      symbol, direction: sig.direction, timestamp: entryCandle.timestamp, exitTs,
      outcome: result.outcome, entryPrice: entry, stopPrice: stop, stopPct: risk / entry,
      rPrice: result.r, fundingR, r: result.r + fundingR,
      signalRate: sig.rate ?? null, z: sig.z ?? null, holdHours,
    });
  }

  return trades;
}
