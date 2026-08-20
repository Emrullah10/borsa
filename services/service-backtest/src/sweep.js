import { fetchCandles, fetchFundingHistory } from '@borsa-bot/core-backtest/src/infrastructure/fetcher.js';
import { makeAlignedBuffer } from '@borsa-bot/core-backtest/src/domain/aligned-buffer.js';
import { runStrategyOverCandles } from '@borsa-bot/core-backtest/src/domain/run-strategy.js';
import { calcMetrics } from '@borsa-bot/core-backtest/src/domain/reporter.js';

// 2026-07-13: BTC/ETH/SOL/BNB/XRP gibi büyük-cap coinlerle test edilmişti, ama
// canlı sistem (MARKET_DATA_SYMBOLS=TOP:50) fiilen çoğunlukla küçük-cap, yüksek
// volatiliteli altcoinlerde sinyal üretiyor — son 7 günün en çok sinyal üreten
// 5 sembolü (BTC son 3 günde sıfır sinyal üretti). Büyük-cap coinlerin ATR%'si
// (~%0.04) bu coinlerinkinden (~%1.0+) çok farklı, bu yüzden eski sweep sonuçları
// gerçek sinyal evrenini temsil etmiyordu.
const SYMBOLS = ['EVAAUSDT', 'LABUSDT', 'VANRYUSDT', 'KORUUSDT', 'VELVETUSDT'];
const DAYS = 30;
const TIMEFRAME = '1m';
const WINDOW = 60;
const REGIME_SYMBOL = 'BTCUSDT';
const REGIME_LEAD_DAYS = 10;

// Grid: threshold × extension-gate × atrStopMult × targetRR.
// 2026-08-20 Parametre Tuning Sweep:
// Önceki turun teşhisi: günde ~666 sinyal, %41.9 WR, fee > edge → net kayıp.
// Bu turun amacı: "daha az ama kaliteli" sinyal üreten parametreleri bulmak.
//   - Threshold yükseltildi: 0.75-0.85 (eski 0.65-0.70 çok gevşekti)
//   - ATR stop genişletildi: 2.0-3.0 (eski 1.0-2.0 gürültü stopuna yol açıyordu)
//   - Target RR düşürüldü: 1.0-1.5 (eski 1.8-2.2 nadiren tutuyordu)
//   - Extension gate sabit ON (önceki sweep'te kanıtlandı)
const THRESHOLDS = [0.75, 0.80, 0.85];
const FIXED_ADX_MAX = 65;
const FIXED_EXTENSION_GATE = true;
const FIXED_REQUIRE_SR_CAP = true;
const ATR_STOP_MULT_OPTIONS = [2.0, 2.5, 3.0];
const TARGET_RR_OPTIONS = [1.0, 1.2, 1.5];

function buildFilterParams() {
  return {
    adxMax: FIXED_ADX_MAX,
    maxPbLong: 0.85, minPbShort: 0.15, rsiMaxLong: 70, rsiMinShort: 30,
  };
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

function runCombo({ regimeBuffer, perSymbol, threshold, filterParams, requireSrCap, atrStopMult, targetRR }) {
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
      atrStopMult,
      targetRR,
    });
    allTrades.push(...trades);
  }
  return allTrades;
}

// Fee-aware metrikler: round-trip taker fee'yi R cinsine çevirip düş
const TAKER_FEE_RT = 0.0012; // %0.06 × 2 = %0.12 round-trip

function formatSweepTable(rows) {
  const header = ['Threshold', 'AtrMult', 'TargetRR', 'Signals', 'Sig/Day', 'Win%', 'PF', 'MaxDD', 'AvgR', 'NetR'];
  const body = rows.map(r => {
    const sigPerDay = (r.metrics.totalSignals / DAYS).toFixed(1);
    // Net R: brüt avgR - fee impact (fee/stop yaklaşık 0.05R — stop genişliğine bağlı)
    const avgFeeR = TAKER_FEE_RT / (r.atrStopMult * 0.01); // yaklaşık fee/R
    const netR = (r.metrics.avgR - avgFeeR).toFixed(3);
    return [
      r.threshold.toFixed(2),
      r.atrStopMult.toFixed(1),
      r.targetRR.toFixed(1),
      r.metrics.totalSignals,
      sigPerDay,
      (r.metrics.winRate * 100).toFixed(1) + '%',
      r.metrics.profitFactor === Infinity ? 'inf' : r.metrics.profitFactor.toFixed(2),
      r.metrics.maxDrawdown,
      r.metrics.avgR.toFixed(3),
      netR,
    ];
  });
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
  const filterParams = buildFilterParams();
  for (const threshold of THRESHOLDS) {
    for (const atrStopMult of ATR_STOP_MULT_OPTIONS) {
      for (const targetRR of TARGET_RR_OPTIONS) {
        const trades = runCombo({
          regimeBuffer, perSymbol, threshold, filterParams,
          requireSrCap: FIXED_REQUIRE_SR_CAP, atrStopMult, targetRR,
        });
        const metrics = calcMetrics(trades);
        rows.push({ threshold, atrStopMult, targetRR, metrics });
      }
    }
  }

  // En iyi kombinasyonları: önce pozitif NetR, sonra WR'ye göre sırala
  rows.sort((a, b) => b.metrics.avgR - a.metrics.avgR || b.metrics.winRate - a.metrics.winRate);

  console.log('\n=== PARAMETRE SWEEP SONUÇLARI (v2 — kalite odaklı) ===');
  console.log(`Semboller: ${SYMBOLS.join(', ')} | Dönem: ${DAYS} gün`);
  console.log(`Cooldown: 60dk (per-symbol) | MinStop: %2.5 | ExtGate: ON | SrCap: ON\n`);
  console.log(formatSweepTable(rows));
  console.log('\nHedef: WR ≥ %50, NetR > 0, Sig/Day 1-15 arası. NetR negatifse o combo fee kaybettiriyor.');
}

main().catch(err => {
  console.error('[sweep] Hata:', err.message);
  process.exit(1);
});
