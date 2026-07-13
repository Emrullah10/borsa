import { fetchCandles, fetchFundingHistory } from '@borsa-bot/core-backtest/src/infrastructure/fetcher.js';
import { makeAlignedBuffer } from '@borsa-bot/core-backtest/src/domain/aligned-buffer.js';
import { runStrategyOverCandles } from '@borsa-bot/core-backtest/src/domain/run-strategy.js';
import { calcMetrics } from '@borsa-bot/core-backtest/src/domain/reporter.js';

// Overfit riskini azaltmak için 2 yerine en az 4-5 likit sembol.
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
const DAYS = 30;
const TIMEFRAME = '1m';
const WINDOW = 60;
const REGIME_SYMBOL = 'BTCUSDT';
const REGIME_LEAD_DAYS = 10;

// Grid: threshold × extension-gate × requireSrCap.
// İlk sweep turunda (2026-07-13) adxMax'ın (60/65/70/yok) sonuca hiçbir etkisi
// olmadığı görüldü — grid'den çıkarıldı, sabit 65 kullanılıyor.
// requireSrCap: canlı veride S/R-kapaklı sinyaller (%46 WR) kapaksızlardan
// (%33 WR) çok daha iyi performans gösteriyor — bu turun asıl test ettiği boyut.
const THRESHOLDS = [0.65, 0.70, 0.75];
const FIXED_ADX_MAX = 65;
const EXTENSION_GATE_OPTIONS = [true, false]; // false = pb/rsi eşikleri gevşetilir (etkisiz)
const REQUIRE_SR_CAP_OPTIONS = [true, false];

function buildFilterParams(extensionGateOn) {
  const params = { adxMax: FIXED_ADX_MAX };
  if (extensionGateOn) {
    Object.assign(params, { maxPbLong: 0.85, minPbShort: 0.15, rsiMaxLong: 70, rsiMinShort: 30 });
  } else {
    Object.assign(params, { maxPbLong: Infinity, minPbShort: -Infinity, rsiMaxLong: 100, rsiMinShort: 0 });
  }
  return params;
}

async function fetchAllSymbolData() {
  console.log(`Veri çekiliyor: ${SYMBOLS.join(', ')} (${DAYS} gün)...`);
  const btc4h = await fetchCandles(REGIME_SYMBOL, '4H', DAYS + REGIME_LEAD_DAYS);
  const regimeBuffer = makeAlignedBuffer(btc4h, 60);

  const perSymbol = {};
  for (const symbol of SYMBOLS) {
    const candles = await fetchCandles(symbol, TIMEFRAME, DAYS);
    const m5 = await fetchCandles(symbol, '5m', DAYS);
    const fundingHistory = await fetchFundingHistory(symbol);
    perSymbol[symbol] = {
      candles,
      higherTfBuffer: makeAlignedBuffer(m5, 60),
      fundingHistory,
    };
    console.log(`[${symbol}] ${candles.length} mum hazır.`);
  }
  return { regimeBuffer, perSymbol };
}

function runCombo({ regimeBuffer, perSymbol, threshold, filterParams, requireSrCap }) {
  const allTrades = [];
  for (const [symbol, data] of Object.entries(perSymbol)) {
    if (data.candles.length < WINDOW) continue;
    const trades = runStrategyOverCandles({
      candles: data.candles,
      fundingHistory: data.fundingHistory,
      regimeBuffer,
      higherTfBuffer: data.higherTfBuffer,
      window: WINDOW,
      threshold,
      symbol,
      filterParams,
      requireSrCap,
    });
    allTrades.push(...trades);
  }
  return allTrades;
}

function formatSweepTable(rows) {
  const header = ['Threshold', 'ExtGate', 'SrCapReq', 'Signals', 'Win%', 'PF', 'MaxDD', 'AvgR'];
  const body = rows.map(r => [
    r.threshold.toFixed(2),
    r.extensionGateOn ? 'on' : 'off',
    r.requireSrCap ? 'on' : 'off',
    r.metrics.totalSignals,
    (r.metrics.winRate * 100).toFixed(1) + '%',
    r.metrics.profitFactor === Infinity ? 'inf' : r.metrics.profitFactor.toFixed(2),
    r.metrics.maxDrawdown,
    r.metrics.avgR.toFixed(3),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map(row => String(row[i]).length)));
  const pad = (s, w) => String(s).padEnd(w);
  const line = widths.map(w => '-'.repeat(w)).join('  ');
  return [
    header.map((h, i) => pad(h, widths[i])).join('  '),
    line,
    ...body.map(row => row.map((v, i) => pad(v, widths[i])).join('  ')),
  ].join('\n');
}

async function main() {
  const { regimeBuffer, perSymbol } = await fetchAllSymbolData();

  const rows = [];
  for (const threshold of THRESHOLDS) {
    for (const extensionGateOn of EXTENSION_GATE_OPTIONS) {
      for (const requireSrCap of REQUIRE_SR_CAP_OPTIONS) {
        const filterParams = buildFilterParams(extensionGateOn);
        const trades = runCombo({ regimeBuffer, perSymbol, threshold, filterParams, requireSrCap });
        const metrics = calcMetrics(trades);
        rows.push({ threshold, extensionGateOn, requireSrCap, metrics });
      }
    }
  }

  // En iyi kombinasyonları win rate'e göre sırala (referans için)
  rows.sort((a, b) => b.metrics.winRate - a.metrics.winRate);

  console.log('\n=== PARAMETRE SWEEP SONUÇLARI ===');
  console.log(`Semboller: ${SYMBOLS.join(', ')} | Dönem: ${DAYS} gün\n`);
  console.log(formatSweepTable(rows));
  console.log('\nNot: WR ≥ %50 ve pozitif AvgR arayın; günlük sinyal sayısının makul kalmasına dikkat edin (çok düşükse overfit riski).');
}

main().catch(err => {
  console.error('[sweep] Hata:', err.message);
  process.exit(1);
});
