export const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

// Ödeme anı → "taşıma günü". Gün d = (d 00:00, d+1 00:00] aralığındaki ödemeler.
// Karar, d 00:00 ödemesinden HEMEN SONRA verilir: o ana kadarki her ödeme bilinir (günler < d) ve
// o an açılan pozisyon d 08:00, d 16:00, d+1 00:00 ödemelerini alır (gün d). Backtest ile canlı
// aynı tanımı kullanmazsa her girişte bir ödeme fazladan/eksik sayılır.
// Binance fundingTime'ı gece yarısından 1-6 ms sonra yazabiliyor (ölçüldü: ~%45 kayıt) →
// önce dakikaya yuvarla, yoksa 00:00 ödemeleri rastgele yanlış güne düşer.
export function carryDayOf(ts) {
  const rounded = Math.round(ts / MINUTE_MS) * MINUTE_MS;
  return Math.floor((rounded - 1) / DAY_MS) * DAY_MS;
}

// [{ timestamp, rate }] → Map<carryDay, o günün funding toplamı>
export function bucketFundingByCarryDay(series) {
  const m = new Map();
  for (const { timestamp, rate } of series) {
    const d = carryDayOf(timestamp);
    m.set(d, (m.get(d) ?? 0) + rate);
  }
  return m;
}

// `day` gününden ÖNCEKİ lookbackDays tam günün ortalama günlük funding'i × 365.
// Pencerede tek gün bile eksikse null (yeni listelenen / verisi kopuk coin sıralamaya girmez).
export function trailingApr(buckets, day, lookbackDays) {
  let sum = 0;
  for (let k = 1; k <= lookbackDays; k++) {
    const v = buckets.get(day - k * DAY_MS);
    if (v === undefined) return null;
    sum += v;
  }
  return (sum / lookbackDays) * 365;
}
