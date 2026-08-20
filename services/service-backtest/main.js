import { fetchCandles, fetchFundingHistory, fetchOISnapshot } from '@borsa-bot/core-backtest/src/infrastructure/fetcher.js';
import { makeAlignedBuffer } from '@borsa-bot/core-backtest/src/domain/aligned-buffer.js';
import { runStrategyOverCandles } from '@borsa-bot/core-backtest/src/domain/run-strategy.js';
import { generateReport } from './src/report-writer.js';

const SYMBOLS   = ['BTCUSDT', 'ETHUSDT'];
const DAYS      = 30;
const TIMEFRAME = '1m';
const WINDOW    = 60;
const THRESHOLD = 0.80;
const REGIME_SYMBOL = 'BTCUSDT'; // canlıdaki gibi rejim her zaman BTC 4h'a bakar
const REGIME_LEAD_DAYS = 10; // dönem başında ≥30 4h mum garantisi için ekstra geçmiş

// Canlıda (make-process-candle.js) rejim BTC 4h'tan, higherTfTrend 1m sinyalleri için 5m'den hesaplanır.
// Backtest bunu birebir eşlemek için aynı iki seri üzerinden aynı fonksiyonları çağırır.
async function fetchRegimeSeries(days) {
  const btc4h = await fetchCandles(REGIME_SYMBOL, '4H', days + REGIME_LEAD_DAYS);
  return makeAlignedBuffer(btc4h, 60);
}

async function fetchHigherTfSeries(symbol, days) {
  const m5 = await fetchCandles(symbol, '5m', days);
  return makeAlignedBuffer(m5, 60);
}

async function runBacktest(symbol, regimeBuffer) {
  console.log(`[${symbol}] Veri çekiliyor...`);

  const candles = await fetchCandles(symbol, TIMEFRAME, DAYS);
  if (candles.length < WINDOW) {
    console.warn(`[${symbol}] Yetersiz veri (${candles.length} mum), atlanıyor.`);
    return [];
  }

  const fundingHistory = await fetchFundingHistory(symbol);
  await fetchOISnapshot(symbol); // şu an trade üretimine katılmıyor, sadece erişim doğrulaması
  const higherTfBuffer = await fetchHigherTfSeries(symbol, DAYS);

  console.log(`[${symbol}] ${candles.length} mum yüklendi. Simülasyon başlıyor...`);

  const trades = runStrategyOverCandles({
    candles, fundingHistory, regimeBuffer, higherTfBuffer,
    window: WINDOW, threshold: THRESHOLD, symbol,
  });

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

  const regimeBuffer = await fetchRegimeSeries(DAYS);

  const tradesBySymbol = {};
  for (const symbol of SYMBOLS) {
    tradesBySymbol[symbol] = await runBacktest(symbol, regimeBuffer);
  }

  generateReport(tradesBySymbol, period);
}

main().catch(err => {
  console.error('[backtest] Hata:', err.message);
  process.exit(1);
});
