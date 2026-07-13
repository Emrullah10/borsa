import { calcAllIndicators } from '@borsa-bot/core-signal-engine/src/domain/indicators.js';
import { calcLiquidationPressure } from '@borsa-bot/core-signal-engine/src/domain/liquidation-pressure.js';
import { calcConfluence } from '@borsa-bot/core-signal-engine/src/domain/confluence.js';
import { calcRegime, calcHigherTfTrend } from '@borsa-bot/core-signal-engine/src/domain/regime.js';
import { applyEntryFilters } from '@borsa-bot/core-signal-engine/src/domain/entry-filters.js';
import { buildSetup } from '@borsa-bot/core-signal-engine/src/domain/setup-builder.js';
import { interpolateFunding } from '../infrastructure/fetcher.js';
import { simulateTrade } from './simulator.js';

const COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_MIN_STOP_PCT = 0.014; // canlıdaki MIN_STOP_PCT_BY_TF['1m'] ile aynı (backtest sadece 1m kullanır)

// Canlı make-process-candle.js ile birebir aynı karar zinciri (parite kritik):
// indicators → liqPressure → regime/higherTfTrend → confluence → entry-filters
// → cooldown → buildSetup (supportLevel/resistanceLevel/minStopPct dahil)
// → simulateTrade. Pure — sweep.js bu fonksiyonu farklı threshold/filterParams
// kombinasyonlarıyla aynı mum verisi üzerinde tekrar çağırır.
//
// NOT (2026-07-13 düzeltildi): bu fonksiyon önceden buildSetup'a supportLevel/
// resistanceLevel/minStopPct geçirmiyordu — canlıda S/R kapağı hedefi kırpıp
// rrRatio'yu düşürebiliyor, backtest'te bu hiç olmuyordu. Bu, sweep sonuçlarının
// gerçek canlı davranışı yanlış simüle etmesine yol açan bir parite kopukluğuydu.
export function runStrategyOverCandles({
  candles, fundingHistory, regimeBuffer, higherTfBuffer,
  window, threshold, symbol, filterParams, minStopPct = DEFAULT_MIN_STOP_PCT, requireSrCap = false,
  atrStopMult, targetRR,
}) {
  if (candles.length < window) return [];

  const trades = [];
  const cooldowns = new Map();

  for (let i = window; i < candles.length; i++) {
    const win = candles.slice(i - window, i);
    const current = candles[i];

    const indicators = calcAllIndicators(win);
    indicators.currentPrice = current.close;

    const funding = interpolateFunding(current.timestamp, fundingHistory);

    const liqPressure = calcLiquidationPressure({
      fundingRate:  funding,
      oiDelta:      0,
      longRatio:    0.5,
      shortRatio:   0.5,
      priceChange:  win.length > 1
        ? (current.close - win[win.length - 2].close) / win[win.length - 2].close
        : 0,
    });

    const regime = calcRegime(regimeBuffer.at(current.timestamp));
    const higherTfTrend = calcHigherTfTrend(higherTfBuffer.at(current.timestamp).map(c => c.close));

    const confluence = calcConfluence(indicators, liqPressure, threshold, higherTfTrend, regime);
    if (!confluence.isCandidate) continue;

    const direction = confluence.direction;

    const filterResult = applyEntryFilters({ direction, indicators, params: filterParams });
    if (!filterResult.allowed) continue;

    const lastSignal = cooldowns.get(direction) ?? 0;
    if (current.timestamp - lastSignal < COOLDOWN_MS) continue;
    cooldowns.set(direction, current.timestamp);

    if (!indicators.atr || indicators.atr === 0) continue;

    const setup = buildSetup({
      direction,
      currentPrice: current.close,
      atr: indicators.atr,
      supportLevel: indicators.supportLevel,
      resistanceLevel: indicators.resistanceLevel,
      minStopPct,
      requireSrCap,
      ...(atrStopMult != null ? { atrStopMult } : {}),
      ...(targetRR != null ? { targetRR } : {}),
    });

    // Canlı make-process-candle.js'nin meetsMinTarget/meetsMinRR/meetsFeeFloor/
    // meetsSrCapRequirement gate'leriyle parite (önceden backtest bunları hiç
    // kontrol etmiyordu — her setup simüle ediliyordu, canlıda reddedilecek
    // olanlar dahil).
    if (!setup.meetsMinTarget || !setup.meetsMinRR || !setup.meetsFeeFloor || !setup.meetsSrCapRequirement) {
      continue;
    }

    const remainingCandles = candles.slice(i + 1);
    const result = simulateTrade(setup, remainingCandles);

    trades.push({
      symbol,
      direction,
      timestamp: current.timestamp,
      entryPrice: setup.entryPrice,
      stopPrice: setup.stopPrice,
      targetPrice: setup.targetPrice,
      rrRatio: setup.rrRatio,
      srCapped: setup.srCapped,
      confluenceScore: confluence.score,
      regime,
      higherTfTrend,
      ...result,
    });
  }

  return trades;
}
