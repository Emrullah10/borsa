// Lab (2026-09-30) — maliyet modeli. Tek yerde: hem Tip 1 hem Tip 2 aynı sabitleri kullanır.
//
//   BTC spread 0.0001% / SOL 0.001% / SUI 0.014% / SKR 0.028% / CYS 0.115%; derinlik BTC $728k,
//   SKR $1.8k. İlk 20 hacimli coin için 0.03%, gerisi için 0.08% temkinli tahmin.
export const COST = {
  takerFee: 0.0006,        // Bitget USDT-M taker, taraf başına
  slippageLiquid: 0.0003,  // ilk 20 (hacme göre)
  slippageThin: 0.0008,    // diğerleri
  liquidTopN: 20,
};

// Taraf başına (tek yön) toplam maliyet oranı. costMultiplier = stres testi (spec: ×2).
export function sideCost({ rank, costMultiplier = 1 } = {}) {
  const liquid = Number.isFinite(rank) && rank <= COST.liquidTopN;
  return (COST.takerFee + (liquid ? COST.slippageLiquid : COST.slippageThin)) * costMultiplier;
}

// simulateTrade(setup, candles, fees)'in beklediği alanlar (taker giriş, mevcut parite kodu).
export function feesForSimulator({ rank, costMultiplier = 1 } = {}) {
  const liquid = Number.isFinite(rank) && rank <= COST.liquidTopN;
  const slip = (liquid ? COST.slippageLiquid : COST.slippageThin) * costMultiplier;
  return {
    takerFee: COST.takerFee * costMultiplier,
    slippagePct: slip,
    exitSlippagePct: slip,
    entryMode: 'taker',
  };
}

// (fromExclusive, toInclusive] aralığındaki funding ödemelerinin toplamı. Seri ts'e göre artan.
export function sumFundingBetween(series, fromExclusive, toInclusive) {
  if (!series.length) return 0;
  // İkili arama: ilk ts > fromExclusive
  let lo = 0; let hi = series.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (series[mid].timestamp > fromExclusive) hi = mid; else lo = mid + 1;
  }
  let sum = 0;
  for (let i = lo; i < series.length && series[i].timestamp <= toInclusive; i++) sum += series[i].rate;
  return sum;
}

const DAY_MS = 24 * 3_600_000;

// UTC gün başlangıcı → o güne düşen [gün, gün+24s) funding toplamı.
export function indexFundingByDay(series) {
  const m = new Map();
  for (const { timestamp, rate } of series) {
    const day = Math.floor(timestamp / DAY_MS) * DAY_MS;
    m.set(day, (m.get(day) ?? 0) + rate);
  }
  return m;
}

// Notional'ın kesri olarak funding PnL'i. Pozitif oranda long öder, short alır.
export function fundingPnlFraction(direction, rateSum) {
  return (direction === 'long' ? -1 : 1) * rateSum;
}

// PnL için funding serisi: Bitget'in kendi verisi varsa (yalnız ~90 gün) o; ondan ÖNCEKİ dönem için
// Binance vekili (korelasyon ~0.58, SOL). Çift kayıt yok.
export function mergeFundingSeries(bitget, binance) {
  if (!bitget.length) return binance;
  const cut = bitget[0].timestamp;
  return [...binance.filter((r) => r.timestamp < cut), ...bitget];
}
