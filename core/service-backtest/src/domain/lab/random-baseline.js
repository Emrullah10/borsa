// Lab (2026-09-30) — yanlış-pozitif kontrolü. Aynı sınav, aynı sinyal ZAMANLAMASI, ama yönler
// rastgele. Bu rastgele strateji maliyetten dolayı kaybetmeli; kazanıyorsa sınavın kendisi
// bozuktur (sızıntı ya da yanlı muhasebe) ve hiçbir sonuç güvenilmez.
import { mulberry32 } from './stats.js';

export function randomizeDirections(signals, seed) {
  const rand = mulberry32(seed);
  return signals.map((s) => ({ ...s, direction: rand() < 0.5 ? 'long' : 'short' }));
}
