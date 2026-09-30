// Lab (2026-09-30) — istatistik yardımcıları. Saf, seed'li (tekrarlanabilir).

// mulberry32: küçük, hızlı, seed'li RNG. Math.random KULLANILMAZ — sonuçlar
// aynı veriyle tekrar üretilebilir olmalı (rapor iki kez koşunca aynı çıkmalı).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mean(xs) {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

// Örneklem standart sapması (n-1).
export function std(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

// Kripto 7/24 işlem gördüğü için yıllıklaştırma √365.
export function sharpeAnnualized(dailyReturns) {
  if (dailyReturns.length < 2) return 0;
  const sd = std(dailyReturns);
  if (sd === 0) return 0;
  return (mean(dailyReturns) / sd) * Math.sqrt(365);
}

// Toplamsal eşitlik eğrisi (sabit brüt maruziyet, ±1/(2k) ağırlıklar) üzerinde
// tepeden dibe en büyük düşüş.
export function maxDrawdown(returns) {
  let equity = 0; let peak = 0; let dd = 0;
  for (const r of returns) {
    equity += r;
    if (equity > peak) peak = equity;
    if (peak - equity > dd) dd = peak - equity;
  }
  return dd;
}

// Dairesel blok bootstrap ile ortalamanın güven aralığı. Günlük sepet getirileri
// otokorelasyonlu olabilir (i.i.d. varsayımı aralığı olduğundan dar gösterir) →
// blockSize>1. Tip 1 işlem R'leri için blockSize=1 (bağımsız işlemler) yeterli.
export function blockBootstrapMeanCI(values, { level = 0.95, blockSize = 1, iterations = 2000, seed = 1 } = {}) {
  const n = values.length;
  if (n === 0) return null;
  const rand = mulberry32(seed);
  const bs = Math.max(1, Math.min(blockSize, n));
  const blocksNeeded = Math.ceil(n / bs);
  const means = new Float64Array(iterations);

  for (let it = 0; it < iterations; it++) {
    let sum = 0; let count = 0;
    for (let b = 0; b < blocksNeeded; b++) {
      const start = Math.floor(rand() * n);
      for (let j = 0; j < bs && count < n; j++) { sum += values[(start + j) % n]; count++; }
    }
    means[it] = sum / count;
  }
  means.sort();

  const alpha = (1 - level) / 2;
  const low = means[Math.min(iterations - 1, Math.floor(alpha * iterations))];
  const high = means[Math.min(iterations - 1, Math.max(0, Math.ceil((1 - alpha) * iterations) - 1))];
  return { mean: mean(values), low, high, n };
}

// Gözlenen değerin rastgele denemeler arasındaki yüzdeliği (eşitler yarım sayılır).
export function percentileRank(value, sample) {
  if (!sample.length) return 0;
  let below = 0; let equal = 0;
  for (const s of sample) { if (s < value) below++; else if (s === value) equal++; }
  return (below + 0.5 * equal) / sample.length;
}

// Kâr birkaç uç gözleme mi bağlı? En iyi ceil(f×n) gözlemi (en az 1) çıkarıp kalanın ortalaması.
// Ortalama > 0 ama bu ≤ 0 ise "kâr" bir piyango biletidir. (Teşhis 2026-09-30: Tip 1'in doğrulama
// kârı tek bir +49.95R işlemdi; F3'ün kârı en iyi 5 günündeydi.)
export function trimBestMean(values, fraction = 0.025) {
  if (values.length < 2) return 0;
  const drop = Math.max(1, Math.ceil(fraction * values.length));
  if (drop >= values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return mean(sorted.slice(0, sorted.length - drop));
}

// Küme bootstrap: gözlemler kümeler halinde (ör. aynı hafta) birlikte örneklenir. Tip 1 işlemleri
// zamanda kümelenir (piyasa çapında funding uçları aynı hafta çok coini tetikler); işlemleri
// bağımsız sayan aralık fazla dar çıkar.
export function clusterBootstrapMeanCI(values, keys, { level = 0.95, iterations = 2000, seed = 1 } = {}) {
  if (!values.length) return null;
  const groups = new Map();
  values.forEach((v, i) => {
    const g = groups.get(keys[i]) ?? { sum: 0, n: 0 };
    g.sum += v; g.n += 1; groups.set(keys[i], g);
  });
  const clusters = [...groups.values()];
  const rand = mulberry32(seed);
  const means = new Float64Array(iterations);
  for (let it = 0; it < iterations; it++) {
    let sum = 0; let count = 0;
    for (let c = 0; c < clusters.length; c++) {
      const pick = clusters[Math.floor(rand() * clusters.length)];
      sum += pick.sum; count += pick.n;
    }
    means[it] = sum / count;
  }
  means.sort();
  const alpha = (1 - level) / 2;
  return {
    mean: mean(values),
    low: means[Math.min(iterations - 1, Math.floor(alpha * iterations))],
    high: means[Math.min(iterations - 1, Math.max(0, Math.ceil((1 - alpha) * iterations) - 1))],
    n: values.length,
  };
}
