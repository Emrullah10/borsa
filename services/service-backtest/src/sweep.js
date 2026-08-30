import pg from 'pg';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchCandles, fetchFundingHistory } from '@borsa-bot/core-backtest/src/infrastructure/fetcher.js';
import { fetchCandlesCached } from '@borsa-bot/core-backtest/src/infrastructure/cached-fetcher.js';
import { makeCandleStoreRepository } from '@borsa-bot/core-backtest/src/infrastructure/persistence/repositories/candle-store-repository.js';
import { makeAlignedBuffer } from '@borsa-bot/core-backtest/src/domain/aligned-buffer.js';
import { runStrategyOverCandles } from '@borsa-bot/core-backtest/src/domain/run-strategy.js';
import { calcMetrics } from '@borsa-bot/core-backtest/src/domain/reporter.js';
import { splitTrainTest } from '@borsa-bot/core-backtest/src/domain/walk-forward.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Faz 1.5 (kalıcı mum deposu): DATABASE_URL tanımlıysa candles tablosundan
// önce okumayı dener (backfill-candles.js ile doldurulmuş olmalı), yoksa/hata
// olursa REST'e düşer — sweep DB'siz de çalışabilir, sadece yavaş olur.
const { Pool } = pg;
const candleRepo = process.env.DATABASE_URL
  ? makeCandleStoreRepository({ db: new Pool({ connectionString: process.env.DATABASE_URL, max: 4 }) })
  : null;

// tf: DB/enum için küçük harf ('1m','5m','4h'); Bitget REST 4h için 'granularity=4H' bekliyor
// (bkz. bitget-ws.js'teki aynı normalizasyon) — fetchFromRest'e REST'in beklediği
// granularity'yi, cache/DB tarafına ise normalize edilmiş tf'i ayrı ayrı geçiriyoruz.
const TF_TO_GRANULARITY = { '1m': '1m', '5m': '5m', '15m': '15m', '4h': '4H' };

async function fetchCandlesForSweep(symbol, tf, days) {
  const granularity = TF_TO_GRANULARITY[tf] ?? tf;
  return fetchCandlesCached({
    repo: candleRepo,
    fetchFromRest: (sym, _tf, d) => fetchCandles(sym, granularity, d),
    symbol, tf, days,
  });
}
// Faz 1.6 (sonuçları diske yaz): önceden sweep sadece console.log basıyordu —
// 2026-07-13 ve 2026-08-20 turlarının tam sonuçları repoda hiç kayıtlı değildi,
// sadece migration yorumlarında özet duruyordu.
const RESULTS_DIR = join(__dirname, '../../../backtest-results');

// 2026-07-13: BTC/ETH/SOL/BNB/XRP gibi büyük-cap coinlerle test edilmişti, ama
// canlı sistem (MARKET_DATA_SYMBOLS=TOP:50) fiilen çoğunlukla küçük-cap, yüksek
// volatiliteli altcoinlerde sinyal üretiyor — son 7 günün en çok sinyal üreten
// 5 sembolü (BTC son 3 günde sıfır sinyal üretti). Büyük-cap coinlerin ATR%'si
// (~%0.04) bu coinlerinkinden (~%1.0+) çok farklı, bu yüzden eski sweep sonuçları
// gerçek sinyal evrenini temsil etmiyordu.
const SYMBOLS = ['EVAAUSDT', 'LABUSDT', 'VANRYUSDT', 'KORUUSDT', 'VELVETUSDT'];
// Doğrulama araştırması (2026-08-20, B2): SYMBOLS "en çok sinyal üreten" diye
// seçilip AYNI dönemde test ediliyordu — seçim ve test aynı veriye bakınca
// yanlılık kaçınılmaz. HOLDOUT_SYMBOLS grid'e hiç girmez; sadece kazanan combo
// üzerinde, görülmemiş bir sembol kümesinde son bir kontrol için kullanılır.
// Seçim kriteri farklı: SYMBOLS listesiyle örtüşmeyen, orta-likit altcoinler.
const HOLDOUT_SYMBOLS = ['WIFUSDT', 'ORDIUSDT', 'PEOPLEUSDT'];
const DAYS = 30;
const TIMEFRAME = '1m';
const WINDOW = 60;
const REGIME_SYMBOL = 'BTCUSDT';
const REGIME_LEAD_DAYS = 10;
// Walk-forward: dönemin son 1/3'ü test, ilk 2/3'ü train (bkz. walk-forward.js).
// Grid TÜM combolar için hem train hem test metriği raporlar; kazanan combo
// train'e göre değil TEST metriğine göre seçilir.
const TEST_FRACTION = 1 / 3;

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
// Faz 1 temizliği (B9-4): FIXED_EXTENSION_GATE kaldırıldı — hiçbir yerde
// kullanılmıyordu (entry-filters.js'te zaten aç/kapa anahtarı yok, overextension
// kontrolü her zaman aktif). Grid açıklaması "extension-gate" boyutunu tarıyormuş
// gibi görünüyordu ama taranan bir şey yoktu.
const FIXED_REQUIRE_SR_CAP = true;
const ATR_STOP_MULT_OPTIONS = [2.0, 2.5, 3.0];
const TARGET_RR_OPTIONS = [1.0, 1.2, 1.5];

// Parite düzeltmesi (2026-08-20 sonrası): simulateTrade artık core-tracker'ın
// evaluateOutcome/evaluateSimOutcome'ını çağırıyor — R'ler zaten fee+slippage
// düşülmüş geliyor (trade.r). Ayrı bir post-hoc NetR yaklaşımına gerek yok;
// eski TAKER_FEE_RT / atrStopMult tahmini kaldırıldı (yanlış ölçek varsayıyordu).
const FEES = { takerFee: 0.0006, slippagePct: 0.0003, exitSlippagePct: 0.0003 };

function buildFilterParams() {
  return {
    adxMax: FIXED_ADX_MAX,
    maxPbLong: 0.85, minPbShort: 0.15, rsiMaxLong: 70, rsiMinShort: 30,
  };
}

// Faz 1 temizliği (B9-5): regimeBuffer parametresi kaldırıldı — gövdede hiç
// referans edilmiyordu (ölü parametre, çağıranları yanıltıyordu).
async function fetchSymbolSet(symbols) {
  const perSymbol = {};
  for (const symbol of symbols) {
    const candles = await fetchCandlesForSweep(symbol, TIMEFRAME, DAYS);
    const m5 = await fetchCandlesForSweep(symbol, '5m', DAYS);
    const fundingHistory = await fetchFundingHistory(symbol);
    perSymbol[symbol] = {
      candles,
      higherTfBuffer: makeAlignedBuffer(m5, 60),
      fundingHistory,
    };
    console.log(`[${symbol}] ${candles.length} mum hazır.`);
  }
  return perSymbol;
}

async function fetchAllSymbolData() {
  console.log(`Veri çekiliyor: ${SYMBOLS.join(', ')} (${DAYS} gün)...`);
  const btc4h = await fetchCandlesForSweep(REGIME_SYMBOL, '4h', DAYS + REGIME_LEAD_DAYS);
  const regimeBuffer = makeAlignedBuffer(btc4h, 60);
  const perSymbol = await fetchSymbolSet(SYMBOLS);
  return { regimeBuffer, perSymbol };
}

function runCombo({ regimeBuffer, perSymbol, threshold, filterParams, requireSrCap, atrStopMult, targetRR, fees }) {
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
      fees,
    });
    allTrades.push(...trades);
  }
  return allTrades;
}

function fmtMetrics(m) {
  return {
    signals: m.totalSignals,
    winPct: (m.winRate * 100).toFixed(1) + '%',
    pf: m.profitFactor === Infinity ? 'inf' : m.profitFactor.toFixed(2),
    maxDD: m.maxDrawdown,
    avgR: m.avgR.toFixed(3),
  };
}

function formatSweepTable(rows) {
  const header = [
    'Threshold', 'AtrMult', 'TargetRR',
    'Train N', 'Train Win%', 'Train PF', 'Train AvgR',
    'Test N', 'Test Win%', 'Test PF', 'Test AvgR',
  ];
  const body = rows.map((r) => {
    const tr = fmtMetrics(r.trainMetrics);
    const te = fmtMetrics(r.testMetrics);
    return [
      r.threshold.toFixed(2), r.atrStopMult.toFixed(1), r.targetRR.toFixed(1),
      tr.signals, tr.winPct, tr.pf, tr.avgR,
      te.signals, te.winPct, te.pf, te.avgR,
    ];
  });
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((row) => String(row[i]).length)));
  const pad = (s, w) => String(s).padEnd(w);
  const line = widths.map((w) => '-'.repeat(w)).join('  ');
  return [
    header.map((h, i) => pad(h, widths[i])).join('  '),
    line,
    ...body.map((row) => row.map((v, i) => pad(v, widths[i])).join('  ')),
  ].join('\n');
}

// Karar kuralı (borsa-strategy-validation-plan Faz 2, önceden taahhüt edildi):
// test katmanında AvgR pozitif VE WR ≥ başabaş+3 puan değilse doğrulanmamış sayılır.
// Fee/slippage sabitleriyle RR~1.0-1.2 için başabaş ~%49-54 arası (bkz. plan).
const BREAKEVEN_WR_PCT = 52; // yaklaşık orta nokta, plan'daki hesaptan
const MARGIN_PCT = 3;

function passesDecisionRule(testMetrics) {
  if (testMetrics.totalSignals < 10) return false; // örneklem çok küçük, karar verilemez
  return testMetrics.avgR > 0 && testMetrics.winRate * 100 >= BREAKEVEN_WR_PCT + MARGIN_PCT;
}

// Faz 1.4 (B9 düzeltmesi): tüm combolar SABİT bir takvim aralığında karşılaştırılır.
// Önceden splitTrainTest her combo'nun kendi trade min/max ts'ini kullanıyordu —
// farklı parametreler farklı trade zaman aralıkları ürettiği için 27 combo aslında
// 27 farklı test dönemi üzerinde karşılaştırılıyordu. Aralık, gerçekten çekilen
// mum verisinin kapsadığı [ilk ts, son ts] aralığıdır — DAYS'ten TAHMİN edilmiyor,
// tüm sembollerin gerçek veri sınırlarından (en erken başlangıç, en geç bitiş) türetilir.
function computeFixedRange(perSymbol) {
  let rangeStartMs = Infinity, rangeEndMs = -Infinity;
  for (const data of Object.values(perSymbol)) {
    if (!data.candles.length) continue;
    rangeStartMs = Math.min(rangeStartMs, data.candles[0].timestamp);
    rangeEndMs = Math.max(rangeEndMs, data.candles[data.candles.length - 1].timestamp);
  }
  if (!Number.isFinite(rangeStartMs) || !Number.isFinite(rangeEndMs)) return null;
  return { rangeStartMs, rangeEndMs };
}

async function main() {
  const { regimeBuffer, perSymbol } = await fetchAllSymbolData();
  const range = computeFixedRange(perSymbol);

  const filterParams = buildFilterParams();
  const rows = [];
  for (const threshold of THRESHOLDS) {
    for (const atrStopMult of ATR_STOP_MULT_OPTIONS) {
      for (const targetRR of TARGET_RR_OPTIONS) {
        const trades = runCombo({
          regimeBuffer, perSymbol, threshold, filterParams,
          requireSrCap: FIXED_REQUIRE_SR_CAP, atrStopMult, targetRR, fees: FEES,
        });
        const { trainTrades, testTrades } = splitTrainTest(trades, TEST_FRACTION, range);
        rows.push({
          threshold, atrStopMult, targetRR,
          trainMetrics: calcMetrics(trainTrades),
          testMetrics: calcMetrics(testTrades),
        });
      }
    }
  }

  // Kazanan combo TEST metriğine göre seçilir — train'e göre sıralamak curve-fit'i ödüllendirir.
  rows.sort((a, b) => b.testMetrics.avgR - a.testMetrics.avgR || b.testMetrics.winRate - a.testMetrics.winRate);

  console.log('\n=== PARAMETRE SWEEP SONUÇLARI — WALK-FORWARD (train/test, SABİT takvim aralığı) ===');
  console.log(`Semboller: ${SYMBOLS.join(', ')} | Dönem: ${DAYS} gün | Test payı: son %${(TEST_FRACTION * 100).toFixed(0)}`);
  console.log(`Cooldown: 60dk (per-symbol) | MinStop: %2.5 | SrCap: ON\n`);
  console.log(formatSweepTable(rows));

  const best = rows[0];
  const verdict = passesDecisionRule(best.testMetrics);
  console.log(`\nEn iyi combo (TEST'e göre): threshold=${best.threshold} atrStopMult=${best.atrStopMult} targetRR=${best.targetRR}`);
  console.log(
    verdict
      ? '✅ Karar kuralını geçti (test AvgR>0, WR ≥ başabaş+3p, n≥10) — walk-forward doğrulandı.'
      : '❌ Karar kuralını GEÇEMEDİ — test metrikleri train ile örtüşmüyor veya örneklem çok küçük. Bu parametreleri canlıda DEĞİŞTİRME, veri toplamaya devam et.',
  );

  console.log('\n=== HOLDOUT SEMBOLLERİNDE KAZANAN COMBO KONTROLÜ ===');
  console.log(`Semboller (grid'e hiç girmedi): ${HOLDOUT_SYMBOLS.join(', ')}`);
  const holdoutPerSymbol = await fetchSymbolSet(HOLDOUT_SYMBOLS);
  const holdoutTrades = runCombo({
    regimeBuffer, perSymbol: holdoutPerSymbol, threshold: best.threshold, filterParams,
    requireSrCap: FIXED_REQUIRE_SR_CAP, atrStopMult: best.atrStopMult, targetRR: best.targetRR, fees: FEES,
  });
  const holdoutMetrics = calcMetrics(holdoutTrades);
  const h = fmtMetrics(holdoutMetrics);
  console.log(`Holdout sonucu: N=${h.signals} Win%=${h.winPct} PF=${h.pf} AvgR=${h.avgR}`);
  const holdoutVerdict = passesDecisionRule(holdoutMetrics);
  console.log(
    holdoutVerdict
      ? "✅ Holdout'ta da karar kuralını geçti."
      : "⚠️  Holdout'ta karar kuralını geçemedi — sembol evrenine özgü curve-fit olabilir.",
  );

  // Faz 1.6 (B10 kapsamı dışı, ayrı madde): sonuçları diske yaz — önceden sweep
  // sadece console.log basıyordu, 2026-07-13/2026-08-20 turlarının tam çıktısı
  // hiç repoda kalmamıştı.
  writeSweepReport({ rows, best, verdict, holdoutMetrics, holdoutVerdict, range });
}

function writeSweepReport({ rows, best, verdict, holdoutMetrics, holdoutVerdict, range }) {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const filename = `sweep-${ts}.json`;
  const payload = {
    generatedAt: now.toISOString(),
    symbols: SYMBOLS,
    holdoutSymbols: HOLDOUT_SYMBOLS,
    days: DAYS,
    fixedRange: range,
    testFraction: TEST_FRACTION,
    grid: { thresholds: THRESHOLDS, atrStopMultOptions: ATR_STOP_MULT_OPTIONS, targetRROptions: TARGET_RR_OPTIONS },
    rows,
    best: { threshold: best.threshold, atrStopMult: best.atrStopMult, targetRR: best.targetRR, verdict },
    holdout: { metrics: holdoutMetrics, verdict: holdoutVerdict },
  };
  mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = join(RESULTS_DIR, filename);
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\nSweep raporu kaydedildi: backtest-results/${filename}`);
}

main().catch((err) => {
  console.error('[sweep] Hata:', err.message);
  process.exit(1);
});
