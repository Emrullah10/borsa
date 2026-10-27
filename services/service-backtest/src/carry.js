// Funding carry backtest'i — canlı servisle AYNI saf fonksiyonlar (selectCarryBook, trailingApr,
// carryDayOf, modeledSideCost, UTILIZATION). funding_rates tablosundan okur; önce
// `npm run backtest:backfill-funding` ile veri güncel olmalı.
//
//   npm run backtest:carry                      # Binance vekili 2022→ + Bitget kendi verisi
//   npm run backtest:carry -- --cost 2          # maliyet stres testi
//
// SINIRLAR (rapora da yazılır): evren BUGÜNÜN Bitget likiditesiyle seçilir (hayatta kalma yanlılığı);
// Binance funding Bitget'in vekili (aynı-an korelasyon ~0.58); baz (spot-perp farkı) değişimi ve
// delist zorunlu kapanışları modellenmez. Gerçek kanıt kâğıt ileri test (service-carry).
import pg from 'pg';
import { CARRY_RULES } from '@borsa-bot/core-carry/src/domain/carry-config.js';
import { bucketFundingByCarryDay, DAY_MS } from '@borsa-bot/core-carry/src/domain/funding-buckets.js';
import { buildCarryUniverse } from '@borsa-bot/core-carry/src/domain/eligibility.js';
import { runCarryBacktest, summarizeDaily } from '@borsa-bot/core-carry/src/domain/backtest-carry.js';
import { makeBitgetPublic } from '@borsa-bot/core-carry/src/infrastructure/bitget-public.js';
import { makeFundingStoreRepository } from '@borsa-bot/core-backtest/src/infrastructure/persistence/repositories/funding-store-repository.js';

const args = process.argv.slice(2);
const costMultiplier = args.includes('--cost') ? parseFloat(args[args.indexOf('--cost') + 1]) : 1;
const pct = (v, d = 1) => (v == null ? '—' : `%${(v * 100).toFixed(d)}`);
const Y = (y) => Date.UTC(y, 0, 1);

async function loadBuckets(store, source, symbols) {
  const out = new Map();
  for (const s of symbols) {
    const series = await store.getFunding(source, s);
    if (series.length) out.set(s, bucketFundingByCarryDay(series));
  }
  return out;
}

function line(label, s, trades) {
  if (!s) return `${label.padEnd(22)} veri yok`;
  return `${label.padEnd(22)} yıllık ${pct(s.apr).padStart(7)} · en kötü düşüş ${pct(s.maxDrawdown, 2).padStart(7)} · en kötü 30g ${pct(s.worst30d, 2).padStart(7)} · pozitif ay ${s.positiveMonths}/${s.totalMonths} · işlem ${trades}`;
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const store = makeFundingStoreRepository({ db: pool });
  const bitget = makeBitgetPublic();
  const [contracts, perpTickers, spotTickers] = await Promise.all([
    bitget.fetchContracts(), bitget.fetchPerpTickers(), bitget.fetchSpotTickers(),
  ]);
  const universe = buildCarryUniverse({ contracts, perpTickers, spotTickers });
  console.log(`# Funding Carry backtest (maliyet ×${costMultiplier})`);
  console.log(`Kurallar: ${JSON.stringify(CARRY_RULES)}`);
  console.log(`Evren (bugünün Bitget likiditesi): ${universe.size} coin\n`);

  const binance = await loadBuckets(store, 'binance', universe.keys());
  console.log(`## Binance funding vekili (${binance.size} coin'de veri)`);
  for (const y of [2022, 2023, 2024, 2025, 2026]) {
    const r = runCarryBacktest({ buckets: binance, universe, from: Y(y), to: Y(y + 1), costMultiplier });
    console.log(line(String(y), summarizeDaily(r.daily), r.trades));
  }
  const all = runCarryBacktest({ buckets: binance, universe, from: Y(2024), to: Y(2027), costMultiplier });
  const sAll = summarizeDaily(all.daily);
  console.log(line('2024-01 → bugün', sAll, all.trades));
  const tot = [...all.contrib.values()].reduce((a, b) => a + b, 0);
  const top = [...all.contrib.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`Yoğunlaşma: en iyi coin payı ${pct(top[0][1] / tot, 0)}, en iyi 3 ${pct(top.slice(0, 3).reduce((a, b) => a + b[1], 0) / tot, 0)} (${top.slice(0, 5).map(([s]) => s).join(', ')})`);
  console.log(`Aylık: ${[...sAll.monthly.entries()].map(([k, v]) => `${k} ${pct(v, 2)}`).join(' | ')}\n`);

  const bitgetB = await loadBuckets(store, 'bitget', universe.keys());
  const firstDay = Math.min(...[...bitgetB.values()].flatMap((m) => [...m.keys()]));
  const from = firstDay + (CARRY_RULES.lookbackDays + 1) * DAY_MS;
  const to = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  console.log(`## Bitget'in KENDİ funding'i (${new Date(from).toISOString().slice(0, 10)} → ${new Date(to).toISOString().slice(0, 10)}) — gerçekte ödenecek oran`);
  const rb = runCarryBacktest({ buckets: bitgetB, universe, from, to, costMultiplier });
  console.log(line('Bitget', summarizeDaily(rb.daily), rb.trades));
  const rn = runCarryBacktest({ buckets: binance, universe, from, to, costMultiplier });
  console.log(line('Aynı dönem Binance', summarizeDaily(rn.daily), rn.trades));
  await pool.end();
}

main().catch((err) => { console.error('[backtest:carry]', err.message); process.exit(1); });
