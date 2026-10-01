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
import { loadLabData } from './lab-data.js';
import { makeF1, makeF2, makeF3 } from '@borsa-bot/core-backtest/src/domain/lab/basket-factors.js';
import { runTip1Family, runTip2Family } from '@borsa-bot/core-backtest/src/domain/lab/lab-pipeline.js';
import { makeHoldoutLock } from '@borsa-bot/core-backtest/src/domain/lab/holdout-lock.js';
import { buildReport } from '@borsa-bot/core-backtest/src/domain/lab/lab-report.js';
import { RULES } from '@borsa-bot/core-backtest/src/domain/lab/verdict.js';
import { PERIODS } from '@borsa-bot/core-backtest/src/domain/lab/periods.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '../../../backtest-results');
const LOCK_PATH = join(RESULTS_DIR, 'lab-holdout-lock.json');

// Tip 1 ızgarası (spec: ön-kayıtlı) — 18 kombinasyon
const GRID_TIP1 = { zThresholds: [2, 2.5, 3], holdHours: [8, 24, 72], stopAtrMults: [3, 6], minAbsRate: 0.0002 };
const QUICK_RULES = { randomTrials: 20, sanityTrials: 10, bootstrapIterations: 800 };

const log = (...a) => console.log('[lab]', ...a);
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

async function main() {
  const args = new Set(process.argv.slice(2));
  const openHoldout = args.has('--open-holdout');
  const force = args.has('--force-reopen');
  const quick = args.has('--quick');
  if (!process.env.DATABASE_URL) { console.error('[lab] DATABASE_URL tanımlı değil. --env-file=.env ile çalıştır.'); process.exit(1); }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const now = Date.now();
  mkdirSync(RESULTS_DIR, { recursive: true });

  const lock = makeHoldoutLock({
    read: () => (existsSync(LOCK_PATH) ? JSON.parse(readFileSync(LOCK_PATH, 'utf8')) : null),
    write: (s) => writeFileSync(LOCK_PATH, JSON.stringify(s, null, 2)),
  });

  log(`mod: ${quick ? 'HIZLI (duman testi)' : 'TAM'} · holdout: ${openHoldout ? 'AÇIK istendi' : 'kapalı'}${force ? ' · --force-reopen' : ''}`);

  const { seriesList, fundingData, fundingForDay, symbolsData } = await loadLabData({ pool, quick, now, log });

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
  // Tip 1 "0 işlem" ile "veri yok"u ayır: 1h mumlar train başlangıcından sonra başlıyorsa backfill eksik.
  const first1h = symbolsData.length ? Math.min(...symbolsData.map((s) => s.candles1h[0].timestamp)) : null;
  if (first1h != null && first1h > PERIODS.train.start) {
    coverage.skippedNote += ` ⚠️ 1h mumlar ${day(first1h)}'de başlıyor (train ${day(PERIODS.train.start)}'de) — Tip 1 sonucu EKSİK VERİYE dayanıyor: backfill-candles --tf 1h --days 900.`;
  }
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
