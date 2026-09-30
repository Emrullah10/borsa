// Lab (2026-09-30) — Strateji Laboratuvarı orkestratörü (I/O katmanı; mantık core-backtest/domain/lab'da).
//
// Kullanım:
//   npm run backtest:lab                        # train + doğrulama (holdout KAPALI)
//   npm run backtest:lab -- --open-holdout      # doğrulamayı geçen adaylar için holdout'u AÇAR (aday başına tek kez)
//   npm run backtest:lab -- --quick             # hızlı duman testi (küçük evren, az deneme)
//   npm run backtest:lab -- --open-holdout --force-reopen   # kilidi aşar, rapor KİRLİ işaretlenir
//
// Önkoşul: mumlar (1h, 1d) ve funding backfill'i (backfill-candles.js, backfill-funding.js).
// ⚠️ Sunucuda DEĞİL, local'de çalıştır.
import pg from 'pg';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchCryptoSymbolSet } from '@borsa-bot/core-backtest/src/infrastructure/fetcher.js';
import { makeCandleStoreRepository } from '@borsa-bot/core-backtest/src/infrastructure/persistence/repositories/candle-store-repository.js';
import { makeFundingStoreRepository } from '@borsa-bot/core-backtest/src/infrastructure/persistence/repositories/funding-store-repository.js';
import { buildSeries, makeF1, makeF2, makeF3, DAY } from '@borsa-bot/core-backtest/src/domain/lab/basket-factors.js';
import { fundingZScores } from '@borsa-bot/core-backtest/src/domain/lab/funding-extreme.js';
import { indexFundingByDay, mergeFundingSeries } from '@borsa-bot/core-backtest/src/domain/lab/cost-model.js';
import { runTip1Family, runTip2Family } from '@borsa-bot/core-backtest/src/domain/lab/lab-pipeline.js';
import { makeHoldoutLock } from '@borsa-bot/core-backtest/src/domain/lab/holdout-lock.js';
import { buildReport } from '@borsa-bot/core-backtest/src/domain/lab/lab-report.js';
import { RULES } from '@borsa-bot/core-backtest/src/domain/lab/verdict.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '../../../backtest-results');
const LOCK_PATH = join(RESULTS_DIR, 'lab-holdout-lock.json');
const HOUR = 3_600_000;

// Tip 1 ızgarası (spec: ön-kayıtlı) — 18 kombinasyon
const GRID_TIP1 = { zThresholds: [2, 2.5, 3], holdHours: [8, 24, 72], stopAtrMults: [3, 6], minAbsRate: 0.0002 };
const QUICK_RULES = { randomTrials: 20, sanityTrials: 10, bootstrapIterations: 800 };

const log = (...a) => console.log('[lab]', ...a);
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

async function distinctSymbols(pool, tf) {
  const { rows } = await pool.query('SELECT DISTINCT symbol FROM candles WHERE tf = $1', [tf]);
  return rows.map((r) => r.symbol);
}

// Statik hacim sırası (kayma katmanı için): son 90 günün ort. USD hacmi. Yaklaşık — raporda belirtilir.
function volumeRanks(seriesList) {
  const avg = seriesList.map((s) => {
    const tail = s.candles.slice(-90);
    return { symbol: s.symbol, v: tail.reduce((a, c) => a + c.close * c.volume, 0) / Math.max(1, tail.length) };
  }).sort((a, b) => b.v - a.v);
  return new Map(avg.map((x, i) => [x.symbol, i + 1]));
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const openHoldout = args.has('--open-holdout');
  const force = args.has('--force-reopen');
  const quick = args.has('--quick');
  if (!process.env.DATABASE_URL) { console.error('[lab] DATABASE_URL tanımlı değil. --env-file=.env ile çalıştır.'); process.exit(1); }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const candleRepo = makeCandleStoreRepository({ db: pool });
  const fundingRepo = makeFundingStoreRepository({ db: pool });
  const now = Date.now();
  mkdirSync(RESULTS_DIR, { recursive: true });

  const lock = makeHoldoutLock({
    read: () => (existsSync(LOCK_PATH) ? JSON.parse(readFileSync(LOCK_PATH, 'utf8')) : null),
    write: (s) => writeFileSync(LOCK_PATH, JSON.stringify(s, null, 2)),
  });

  log(`mod: ${quick ? 'HIZLI (duman testi)' : 'TAM'} · holdout: ${openHoldout ? 'AÇIK istendi' : 'kapalı'}${force ? ' · --force-reopen' : ''}`);

  // --- Evren: yalnız KRİPTO (RWA hisse/ETF/emtia hariç) ---
  const cryptoSet = await fetchCryptoSymbolSet();
  log(`kripto sembol (RWA hariç, normal durum): ${cryptoSet.size}`);

  // --- Günlük mumlar (Tip 2) ---
  let dailySymbols = (await distinctSymbols(pool, '1d')).filter((s) => cryptoSet.has(s));
  const seriesAll = [];
  for (const symbol of dailySymbols) {
    const candles = (await candleRepo.getCandles(symbol, '1d')).filter((c) => c.timestamp + DAY <= now); // yalnız tamamlanmış günler
    if (candles.length >= 90) seriesAll.push(buildSeries(symbol, candles));
  }
  if (!seriesAll.length) { console.error('[lab] günlük mum yok — önce: backtest:backfill-candles --tf 1d'); process.exit(1); }
  const ranks = volumeRanks(seriesAll);
  const seriesList = quick ? seriesAll.filter((s) => ranks.get(s.symbol) <= 40) : seriesAll;
  log(`Tip 2 evreni: ${seriesList.length} sembol (günlük)`);

  // --- Funding (iki kaynak) ---
  const fundingData = new Map();
  const loadFunding = async (symbol) => {
    if (fundingData.has(symbol)) return fundingData.get(symbol);
    const [bitget, binance] = await Promise.all([fundingRepo.getFunding('bitget', symbol), fundingRepo.getFunding('binance', symbol)]);
    const d = {
      bitget, binance, bitgetByDay: indexFundingByDay(bitget), binanceByDay: indexFundingByDay(binance),
      bitgetMinDay: bitget.length ? Math.floor(bitget[0].timestamp / DAY) * DAY : null,
      binanceMinDay: binance.length ? Math.floor(binance[0].timestamp / DAY) * DAY : null,
    };
    fundingData.set(symbol, d);
    return d;
  };
  for (const s of seriesList) await loadFunding(s.symbol);

  // Bitget'in kendi verisi varsa o, yoksa Binance vekili, hiçbiri yoksa null (= bilinmiyor → 0 varsayılır ve sayılır)
  const fundingForDay = (symbol, u) => {
    const d = fundingData.get(symbol);
    if (!d) return null;
    if (d.bitgetMinDay != null && u >= d.bitgetMinDay) return d.bitgetByDay.get(u) ?? 0;
    if (d.binanceMinDay != null && u >= d.binanceMinDay) return d.binanceByDay.get(u) ?? 0;
    return null;
  };

  // --- Tip 1 verisi (1h mum + funding sinyal serisi) ---
  let hourlySymbols = (await distinctSymbols(pool, '1h')).filter((s) => cryptoSet.has(s));
  if (quick) hourlySymbols = hourlySymbols.filter((s) => (ranks.get(s) ?? 999) <= 20);
  const symbolsData = [];
  for (const symbol of hourlySymbols) {
    const f = await loadFunding(symbol);
    const signalSeries = f.binance.length >= 200 ? f.binance : f.bitget; // sinyal: uzun geçmişli kaynak
    if (signalSeries.length < 200) continue;
    const candles1h = (await candleRepo.getCandles(symbol, '1h')).filter((c) => c.timestamp + HOUR <= now);
    if (candles1h.length < 500) continue;
    symbolsData.push({
      symbol, candles1h, rank: ranks.get(symbol),
      zScores: fundingZScores(signalSeries, { window: 90, minPeriods: 30 }),
      pnlSeries: mergeFundingSeries(f.bitget, f.binance), // PnL: Bitget varsa o, öncesi Binance
    });
  }
  log(`Tip 1 evreni: ${symbolsData.length} sembol (1h + funding)`);

  const rules = quick ? QUICK_RULES : {};

  // --- Sınavlar ---
  log('Tip 1 (funding uçları) koşuluyor...');
  const tip1 = runTip1Family({ symbolsData, grid: GRID_TIP1, lock, openHoldout, force, rules });

  const families = [
    { key: 'F1_momentum', title: 'F1 momentum (Tip 2)', configs: [7, 14, 28].flatMap((L) => [1, 7].map((r) => ({ label: `L=${L}g · ${r === 1 ? 'günlük' : 'haftalık'} dengeleme`, scoreFn: makeF1(L), rebalanceEvery: r }))) },
    { key: 'F2_reversal', title: 'F2 dönüş (Tip 2)', configs: [{ label: 'dünün getirisinin tersi · günlük', scoreFn: makeF2(), rebalanceEvery: 1 }] },
    { key: 'F3_smallcap', title: 'F3 küçük/geniş-aralık/trend (Tip 2)', configs: [{ label: 'kompozit sıra · günlük', scoreFn: makeF3(), rebalanceEvery: 1 }] },
  ];
  const results = [tip1];
  for (const f of families) {
    log(`${f.title} koşuluyor...`);
    results.push(runTip2Family({ ...f, seriesList, fundingForDay, lock, openHoldout, force, rules }));
  }

  // --- Rapor ---
  const withBinance = seriesList.filter((s) => fundingData.get(s.symbol)?.binance.length).length;
  const allDays = seriesList.flatMap((s) => [s.candles[0].timestamp, s.candles.at(-1).timestamp]);
  const coverage = {
    cryptoSymbols: seriesList.length,
    dailyRange: `${day(Math.min(...allDays))} → ${day(Math.max(...allDays))}`,
    fundingBinancePct: Math.round((100 * withBinance) / seriesList.length),
    skippedNote: `Tip 1 evreni ${symbolsData.length} sembol; Tip 2 günlük evren filtresi: 30g ort. USD hacim ≥ $5M ve ≥60 gün geçmiş (o güne göre). Funding'i hiç bilinmeyen sembol-günler 0 varsayıldı.`,
  };
  const md = buildReport({ generatedAt: new Date().toISOString(), coverage, holdoutOpened: openHoldout, families: results });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const base = join(RESULTS_DIR, `lab-${quick ? 'quick-' : ''}${stamp}`);
  writeFileSync(`${base}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), quick, openHoldout, force, rules: RULES, grid: GRID_TIP1, coverage, results, lock: lock.state() }, null, 2));
  writeFileSync(`${base}.md`, md);

  console.log(`\n${md}\n`);
  log(`kaydedildi: ${base}.json / .md`);

  const broken = results.filter((r) => r.sanity && !r.sanity.sane);
  if (broken.length) {
    console.error(`\n[lab] ⚠️ SINAV BOZUK (${broken.map((r) => r.title).join(', ')}): rastgele strateji kâr ediyor — sonuçlara GÜVENME.`);
    process.exitCode = 2;
  }
  await pool.end();
}

const { Pool } = pg;
main().catch((err) => { console.error('[lab] Kritik hata:', err.stack ?? err.message); process.exit(1); });
