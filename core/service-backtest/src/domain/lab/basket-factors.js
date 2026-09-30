// Lab (2026-09-30) — Tip 2 sepet faktörleri. Hepsi SAF ve yalnızca `day` ve öncesindeki günlük
// mumları kullanır (gün d'nin kapanışı d+24s'te bilinir; işlem d+1'in açılışında yapılır).
// Skor yüksek = LONG adayı, düşük = SHORT adayı.
import { mulberry32 } from './stats.js';

export const DAY = 86_400_000;

// candles: artan, günlük (00:00 UTC hizalı) {timestamp, open, high, low, close, volume}
export function buildSeries(symbol, candles) {
  const byDay = new Map();
  candles.forEach((c, i) => byDay.set(c.timestamp, i));
  return { symbol, candles, byDay };
}

// `day`'den `back` gün önceki mum — yoksa (boşluk) null. Günlük hizalı artan seride
// başlangıç ve bitiş zaman damgaları tutuyorsa aradaki tüm günler vardır.
function at(series, idx, day, back) {
  const c = series.candles[idx - back];
  return c && c.timestamp === day - back * DAY ? c : null;
}

// F1 momentum: son L günün getirisi. Üst beşli LONG, alt beşli SHORT.
export function makeF1(L) {
  return (members, day) => {
    const out = new Map();
    for (const { symbol, series, idx } of members) {
      const now = series.candles[idx];
      const past = at(series, idx, day, L);
      if (now && past && past.close > 0) out.set(symbol, now.close / past.close - 1);
    }
    return out;
  };
}

// F2 dönüş: dün en çok DÜŞEN LONG, en çok YÜKSELEN SHORT (skor = −1 günlük getiri).
export function makeF2() {
  return (members, day) => {
    const out = new Map();
    for (const { symbol, series, idx } of members) {
      const now = series.candles[idx];
      const prev = at(series, idx, day, 1);
      if (now && prev && prev.close > 0) out.set(symbol, -(now.close / prev.close - 1));
    }
    return out;
  };
}

// Kesitsel sıra (1..N, küçükten büyüğe); beraberlikte sembol adı → deterministik.
function rankAsc(entries) {
  const sorted = [...entries].sort((a, b) => a.v - b.v || (a.symbol < b.symbol ? -1 : 1));
  return new Map(sorted.map((e, i) => [e.symbol, i + 1]));
}

// F3 (arXiv 2604.26747 benzeri): küçük/az işlem gören, gün içi aralığı geniş, trendi pozitif → LONG.
//   hacim30 = son 30 gün ort. USD hacim (düşük iyi) · aralık20 = son 20 gün ort. (high−low)/close
//   ret20 = 20 günlük getiri. Skor = üç sıranın toplamı.
export function makeF3() {
  return (members, day) => {
    const rows = [];
    for (const { symbol, series, idx } of members) {
      const c = series.candles;
      if (!at(series, idx, day, 29)) continue; // 30 günlük kesintisiz pencere şart
      let vol = 0; let range = 0;
      for (let j = 0; j < 30; j++) vol += c[idx - j].close * c[idx - j].volume;
      for (let j = 0; j < 20; j++) range += (c[idx - j].high - c[idx - j].low) / c[idx - j].close;
      const past = c[idx - 20];
      if (!past || past.close <= 0) continue;
      rows.push({ symbol, vol: vol / 30, range: range / 20, ret20: c[idx].close / past.close - 1 });
    }
    const rVol = rankAsc(rows.map((r) => ({ symbol: r.symbol, v: -r.vol })));
    const rRange = rankAsc(rows.map((r) => ({ symbol: r.symbol, v: r.range })));
    const rRet = rankAsc(rows.map((r) => ({ symbol: r.symbol, v: r.ret20 })));
    return new Map(rows.map((r) => [r.symbol, rVol.get(r.symbol) + rRange.get(r.symbol) + rRet.get(r.symbol)]));
  };
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Yanlış-pozitif kontrolü: (seed, gün, sembol) → deterministik rastgele skor. Üye sırasından bağımsız.
export function makeRandom(seed) {
  return (members, day) => new Map(members.map(({ symbol }) => [symbol, mulberry32(hash32(`${seed}|${symbol}|${day}`))()]));
}

