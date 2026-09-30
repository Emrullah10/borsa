// Lab (2026-09-30) — funding oranı geçmişini funding_rates tablosuna yazar.
//
// Kullanım:
//   node --env-file=.env services/service-backtest/src/backfill-funding.js
//   node --env-file=.env services/service-backtest/src/backfill-funding.js --source bitget
//   node --env-file=.env services/service-backtest/src/backfill-funding.js --symbols BTCUSDT,SOLUSDT --from 2022-01-01
//   node --env-file=.env services/service-backtest/src/backfill-funding.js --universe-min-volume 5000000
//
// Bitget geçmişi yalnız ~90 gün saklıyor → --source bitget'i en geç ~60 günde bir çalıştır,
// yoksa veri kalıcı olarak kaybolur. Binance yıllarca geriye veriyor (Bitget ile korelasyon ~0.58).
// ⚠️ Sunucuda DEĞİL, local'de çalıştır.
import pg from 'pg';
import {
  fetchFundingHistory, fetchBinanceFundingHistory, binanceSymbolCandidates, fetchLiquidUniverse,
} from '@borsa-bot/core-backtest/src/infrastructure/fetcher.js';
import { makeFundingStoreRepository } from '@borsa-bot/core-backtest/src/infrastructure/persistence/repositories/funding-store-repository.js';

const { Pool } = pg;
const DEFAULT_MIN_VOLUME = 5_000_000;
const DEFAULT_FROM = '2022-01-01';

function parseArgs(argv) {
  const args = { source: 'both', symbols: null, minVolume: DEFAULT_MIN_VOLUME, from: DEFAULT_FROM };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i + 1];
    if (argv[i] === '--source' && v) { args.source = v; i++; }
    else if (argv[i] === '--symbols' && v) { args.symbols = v.split(',').map((s) => s.trim().toUpperCase()); i++; }
    else if (argv[i] === '--universe-min-volume' && v) { args.minVolume = parseFloat(v); i++; }
    else if (argv[i] === '--from' && v) { args.from = v; i++; }
  }
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (ms) => (ms == null ? '—' : new Date(ms).toISOString().slice(0, 10));

async function main() {
  const { source, symbols: explicit, minVolume, from } = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    console.error('[backfill-funding] DATABASE_URL tanımlı değil. --env-file=.env ile çalıştır.');
    process.exit(1);
  }
  if (!['bitget', 'binance', 'both'].includes(source)) {
    console.error(`[backfill-funding] --source bitget|binance|both olmalı (verilen: ${source})`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const repo = makeFundingStoreRepository({ db: pool });
  const symbols = explicit ?? await fetchLiquidUniverse({ minVolumeUsdt: minVolume });
  const fromMs = Date.parse(`${from}T00:00:00Z`);

  console.log(`[backfill-funding] kaynak=${source} · ${symbols.length} sembol · Binance başlangıç=${from}`);

  const summary = { bitget: 0, binanceOk: 0, binanceMissing: [] };

  for (const symbol of symbols) {
    if (source !== 'binance') {
      const rows = await fetchFundingHistory(symbol);
      await repo.upsertFunding('bitget', symbol, rows);
      if (rows.length) summary.bitget++;
      console.log(`[bitget ] ${symbol.padEnd(16)} ${String(rows.length).padStart(5)} kayıt  ${day(rows[0]?.timestamp)} → ${day(rows.at(-1)?.timestamp)}`);
      await sleep(200);
    }

    if (source !== 'bitget') {
      // Artımlı: önceden yazılan son kayıttan devam et (Binance rate limit: 5dk'da 500 istek).
      const cov = await repo.getCoverage('binance', symbol);
      const startMs = cov.maxTs != null ? Math.max(fromMs, cov.maxTs + 1) : fromMs;
      let rows = [];
      let used = null;
      for (const candidate of binanceSymbolCandidates(symbol)) {
        rows = await fetchBinanceFundingHistory(candidate, { fromMs: startMs });
        if (rows.length) { used = candidate; break; }
      }
      await repo.upsertFunding('binance', symbol, rows);
      if (used || cov.count > 0) summary.binanceOk++; else summary.binanceMissing.push(symbol);
      console.log(`[binance] ${symbol.padEnd(16)} ${String(rows.length).padStart(5)} yeni  ${used && used !== symbol ? `(${used}) ` : ''}${day(rows[0]?.timestamp)} → ${day(rows.at(-1)?.timestamp)}`);
    }
  }

  console.log('\n[backfill-funding] ÖZET');
  if (source !== 'binance') console.log(`  Bitget : ${summary.bitget}/${symbols.length} sembolde veri`);
  if (source !== 'bitget') {
    console.log(`  Binance: ${summary.binanceOk}/${symbols.length} sembolde veri (${((summary.binanceOk / symbols.length) * 100).toFixed(0)}%)`);
    if (summary.binanceMissing.length) console.log(`  Binance'te bulunamayan: ${summary.binanceMissing.join(', ')}`);
  }
  await pool.end();
}

main().catch((err) => { console.error('[backfill-funding] Kritik hata:', err.message); process.exit(1); });
