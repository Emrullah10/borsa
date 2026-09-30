// Lab (2026-09-30) — Tip 1 sinyali: "kalabalığın tersine" (funding uçları).
// Herkes aynı tarafa yüklenip yüksek funding öderken ters tarafa geçmek.
import { mean, std } from './stats.js';

// Her funding anı için, o andan ÖNCEKİ `window` gözlemden z-skoru. Anın kendisi pencereye
// GİRMEZ (aksi halde spike kendi std'sini şişirir), ve gelecek veri hiçbir geçmiş z'yi
// değiştirmez (sızıntı testi funding-extreme.test.js). Geçmiş std=0 ise (tamamen sabit
// seri) o nokta atlanır — sonsuz z üretmek yerine.
export function fundingZScores(series, { window = 90, minPeriods = 30 } = {}) {
  const out = [];
  for (let i = minPeriods; i < series.length; i++) {
    const prev = series.slice(Math.max(0, i - window), i).map((p) => p.rate);
    const sd = std(prev);
    if (sd === 0) continue;
    out.push({ index: i, timestamp: series[i].timestamp, rate: series[i].rate, z: (series[i].rate - mean(prev)) / sd });
  }
  return out;
}

// z ≥ +eşik ve oran yeterince büyük pozitif → SHORT (long'lar kalabalık).
// z ≤ −eşik ve oran yeterince büyük negatif → LONG (short'lar kalabalık).
// minAbsRate: küçük mutlak oranlardaki (0.02%/8s altı) istatistiksel-ama-ekonomik-olmayan
// uçları eler. Not: 1s/4s funding aralıklı kontratlarda oranlar küçük olduğundan bu eşik
// onları daha az yakalar — raporda belirtilir.
export function detectFundingExtremes(series, { window = 90, zThreshold, minAbsRate = 0.0002, minPeriods = 30 } = {}) {
  const signals = [];
  for (const p of fundingZScores(series, { window, minPeriods })) {
    if (Math.abs(p.rate) < minAbsRate) continue;
    if (p.z >= zThreshold && p.rate > 0) signals.push({ timestamp: p.timestamp, direction: 'short', rate: p.rate, z: p.z });
    else if (p.z <= -zThreshold && p.rate < 0) signals.push({ timestamp: p.timestamp, direction: 'long', rate: p.rate, z: p.z });
  }
  return signals;
}
