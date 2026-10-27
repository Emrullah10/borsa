import { CARRY_RULES, modeledSideCost } from './carry-config.js';
import { DAY_MS, trailingApr } from './funding-buckets.js';
import { selectCarryBook } from './selector.js';
import { UTILIZATION } from './paper-book.js';

// Günlük taşıma backtest'i. Canlı servisle AYNI selectCarryBook/trailingApr/maliyet fonksiyonları.
// Her gün d: karar günler < d ile verilir, tutulan pozisyonlar gün d funding'ini alır.
// Getiri özsermayenin kesri: slot ağırlığı UTILIZATION/N (canlı slotNotional ile aynı).
//
// buckets:  Map<symbol, Map<carryDay, fundingSum>>  (bucketFundingByCarryDay çıktısı)
// universe: Map<symbol, { spotVolume }>              (eligible evren — maliyet sınıfı spotVolume'dan)
export function runCarryBacktest({ buckets, universe, from, to, rules = CARRY_RULES, costMultiplier = 1 }) {
  const w = UTILIZATION / rules.slots;
  const days = new Set();
  for (const m of buckets.values()) for (const d of m.keys()) if (d >= from && d < to) days.add(d);
  const sorted = [...days].sort((a, b) => a - b);

  const held = new Set();
  const daily = [];
  const contrib = new Map();
  let trades = 0;
  const add = (s, v) => contrib.set(s, (contrib.get(s) ?? 0) + v);
  const cost = (s) => modeledSideCost(universe.get(s)?.spotVolume ?? 0, costMultiplier) * w;

  for (const d of sorted) {
    const candidates = [];
    for (const symbol of universe.keys()) {
      const m = buckets.get(symbol);
      if (!m) continue;
      const apr = trailingApr(m, d, rules.lookbackDays);
      if (apr !== null) candidates.push({ symbol, apr });
    }
    const { close, open } = selectCarryBook({ candidates, held, rules });
    let ret = 0;
    for (const { symbol } of close) { held.delete(symbol); ret -= cost(symbol); add(symbol, -cost(symbol)); trades++; }
    for (const { symbol } of open) { held.add(symbol); ret -= cost(symbol); add(symbol, -cost(symbol)); trades++; }
    for (const symbol of held) {
      const f = (buckets.get(symbol)?.get(d) ?? 0) * w;
      ret += f; add(symbol, f);
    }
    daily.push({ day: d, ret, held: held.size });
  }
  return { daily, trades, contrib };
}

// Günlük getiri serisinin özeti (basit toplam; günlük getiriler ~%0.1 mertebesinde, bileşik fark ihmal).
export function summarizeDaily(daily) {
  const n = daily.length;
  if (!n) return null;
  let eq = 0; let peak = 0; let mdd = 0; let neg = 0; let sum = 0;
  const monthly = new Map();
  for (const { day, ret } of daily) {
    sum += ret; eq += ret; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq - peak);
    if (ret < 0) neg++;
    const k = new Date(day).toISOString().slice(0, 7);
    monthly.set(k, (monthly.get(k) ?? 0) + ret);
  }
  let worst30 = null;
  for (let i = 30; i <= n; i++) {
    let s = 0;
    for (let j = i - 30; j < i; j++) s += daily[j].ret;
    worst30 = worst30 === null ? s : Math.min(worst30, s);
  }
  const mean = sum / n;
  const sd = Math.sqrt(daily.reduce((a, b) => a + (b.ret - mean) ** 2, 0) / Math.max(1, n - 1));
  const months = [...monthly.values()];
  return {
    days: n,
    apr: mean * 365,
    maxDrawdown: mdd,
    negativeDayShare: neg / n,
    worst30d: worst30,
    tStat: sd > 0 ? (mean / sd) * Math.sqrt(n) : null,
    positiveMonths: months.filter((v) => v > 0).length,
    totalMonths: months.length,
    monthly,
  };
}

export { DAY_MS };
