// Funding oranı geçmişini funding_rates tablosuna yazar (backtest için: npm run carry:backtest).
//
// Kullanım:
//   npm run carry:backfill-funding
//   npm run carry:backfill-funding -- --source bitget
//   npm run carry:backfill-funding -- --symbols BTCUSDT,SOLUSDT --from 2022-01-01
//
// Varsayılan sembol listesi = bugünün taşıma evreni (Bitget'te spotu ve yeterli likiditesi olan coinler).
// Bitget geçmişi yalnız ~90 gün saklıyor; canlı servis (service-carry) elindeki/evrendeki coinlerin
// funding'ini zaten her gün yazıyor. Binance yıllarca geriye veriyor (Bitget ile korelasyon ~0.58).
import pg from 'pg';
import { makeBitgetPublic } from '@borsa-bot/core-carry/src/infrastructure/bitget-public.js';
import { buildCarryUniverse } from '@borsa-bot/core-carry/src/domain/eligibility.js';
import { fetchBinanceFundingHistory, binanceSymbolCandidates } from '@borsa-bot/core-carry/src/infrastructure/binance-funding.js';
import { makeFundingStoreRepository } from '@borsa-bot/core-carry/src/infrastructure/repositories/funding-store-repository.js';

const { Pool } = pg;
const DEFAULT_FROM = '2022-01-01';

function parseArgs(argv) {
  const args = { source: 'both', symbols: null, from: DEFAULT_FROM };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i + 1];
    if (argv[i] === '--source' && v) { args.source = v; i++; }
    else if (argv[i] === '--symbols' && v) { args.symbols = v.split(',').map((s) => s.trim().toUpperCase()); i++; }
    else if (argv[i] === '--from' && v) { args.from = v; i++; }
  }
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function carryUniverse(bitget) {
  const [contracts, perpTickers, spotTickers] = await Promise.all([
    bitget.fetchContracts(), bitget.fetchPerpTickers(), bitget.fetchSpotTickers(),
  ]);
  return [...buildCarryUniverse({ contracts, perpTickers, spotTickers }).keys()];
}

const day = (ms) => (ms == null ? '—' : new Date(ms).toISOString().slice(0, 10));

async function main() {
  const { source, symbols: explicit, from } = parseArgs(process.argv.slice(2));
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
  const bitget = makeBitgetPublic();
  const symbols = explicit ?? await carryUniverse(bitget);
  const fromMs = Date.parse(`${from}T00:00:00Z`);

  console.log(`[backfill-funding] kaynak=${source} · ${symbols.length} sembol · Binance başlangıç=${from}`);

  const summary = { bitget: 0, binanceOk: 0, binanceMissing: [] };

  for (const symbol of symbols) {
    if (source !== 'binance') {
      let rows = [];
      try {
        rows = await bitget.fetchFundingSince(symbol, 0, { maxPages: 60 });
      } catch (err) {
        console.warn(`[bitget ] ${symbol} alınamadı: ${err.message}`);
      }
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
