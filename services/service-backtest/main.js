import { fetchCandles, fetchFundingHistory, fetchOISnapshot, interpolateFunding } from '@borsa-bot/core-backtest/src/infrastructure/fetcher.js';
import { simulateTrade } from '@borsa-bot/core-backtest/src/domain/simulator.js';
import { generateReport } from './src/report-writer.js';
import { calcAllIndicators } from '@borsa-bot/core-signal-engine/src/domain/indicators.js';
import { calcLiquidationPressure } from '@borsa-bot/core-signal-engine/src/domain/liquidation-pressure.js';
import { calcConfluence } from '@borsa-bot/core-signal-engine/src/domain/confluence.js';
import { buildSetup } from '@borsa-bot/core-signal-engine/src/domain/setup-builder.js';

const SYMBOLS   = ['BTCUSDT', 'ETHUSDT'];
const DAYS      = 30;
const TIMEFRAME = '1m';
const WINDOW    = 60;
const THRESHOLD = 0.65;

async function runBacktest(symbol) {
  console.log(`[${symbol}] Veri çekiliyor...`);

  const candles = await fetchCandles(symbol, TIMEFRAME, DAYS);
  if (candles.length < WINDOW) {
    console.warn(`[${symbol}] Yetersiz veri (${candles.length} mum), atlanıyor.`);
    return [];
  }

  const fundingHistory = await fetchFundingHistory(symbol);
  const oiSnapshot     = await fetchOISnapshot(symbol);

  console.log(`[${symbol}] ${candles.length} mum yüklendi. Simülasyon başlıyor...`);

  const trades = [];
  const cooldowns = new Map();

  for (let i = WINDOW; i < candles.length; i++) {
    const window = candles.slice(i - WINDOW, i);
    const current = candles[i];

    const indicators = calcAllIndicators(window);
    indicators.currentPrice = current.close;

    const funding = interpolateFunding(current.timestamp, fundingHistory);

    const liqPressure = calcLiquidationPressure({
      fundingRate:  funding,
      oiDelta:      0,
      longRatio:    0.5,
      shortRatio:   0.5,
      priceChange:  window.length > 1
        ? (current.close - window[window.length - 2].close) / window[window.length - 2].close
        : 0,
    });

    const confluence = calcConfluence(indicators, liqPressure, THRESHOLD);
    if (!confluence.isCandidate) continue;

    const direction = confluence.direction;

    const lastSignal = cooldowns.get(direction) ?? 0;
    if (current.timestamp - lastSignal < 5 * 60 * 1000) continue;
    cooldowns.set(direction, current.timestamp);

    if (!indicators.atr || indicators.atr === 0) continue;

    const setup = buildSetup({
      direction,
      currentPrice: current.close,
      atr: indicators.atr,
    });

    const remainingCandles = candles.slice(i + 1);
    const result = simulateTrade(setup, remainingCandles);

    trades.push({
      symbol,
      direction,
      timestamp: current.timestamp,
      entryPrice: setup.entryPrice,
      stopPrice: setup.stopPrice,
      targetPrice: setup.targetPrice,
      confluenceScore: confluence.score,
      ...result,
    });
  }

  console.log(`[${symbol}] ${trades.length} sinyal üretildi.`);
  return trades;
}

async function main() {
  const to   = new Date();
  const from = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const period = {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
    days: DAYS,
  };

  const tradesBySymbol = {};
  for (const symbol of SYMBOLS) {
    tradesBySymbol[symbol] = await runBacktest(symbol);
  }

  generateReport(tradesBySymbol, period);
}

main().catch(err => {
  console.error('[backtest] Hata:', err.message);
  process.exit(1);
});
