// Lab (2026-09-30) — yanlış-pozitif kontrolü. Aynı sınav, aynı sinyal ZAMANLAMASI, ama yönler
// rastgele. Bu rastgele strateji maliyetten dolayı kaybetmeli; kazanıyorsa sınavın kendisi
// bozuktur (sızıntı ya da yanlı muhasebe) ve hiçbir sonuç güvenilmez.
import { mulberry32 } from './stats.js';

export function randomizeDirections(signals, seed) {
  const rand = mulberry32(seed);
  return signals.map((s) => ({ ...s, direction: rand() < 0.5 ? 'long' : 'short' }));
}

// Sınav-sağlamlığı boş hipotezi: sinyal SAYISI aynı, ama zamanlar (adaylardan rastgele) ve yönler
// rastgele. Bu stratejinin kâr etmemesi gerekir; ediyorsa sınavın muhasebesi yanlıdır.
// (Aynı-zamanlama + rastgele-yön tabanı, olay anlarında volatilite artıyorsa stop'lu yapının
// içbükeyliği yüzünden kâr edebilir — o taban yön kuralının EK değerini ölçer, sağlamlığı değil.)
export function randomizeTimesAndDirections(signals, candidateTimestamps, seed) {
  if (!candidateTimestamps.length) return [];
  const rand = mulberry32(seed);
  return signals
    .map((s) => ({
      ...s,
      timestamp: candidateTimestamps[Math.floor(rand() * candidateTimestamps.length)],
      direction: rand() < 0.5 ? 'long' : 'short',
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}
