// Wilson score interval — küçük örneklem win rate'lerinin gerçek belirsizliğini gösterir.
// n=30'da %55 gözlenmesi, gerçek oranın %37-72 arasında olabileceği anlamına gelir.
const Z = 1.96; // %95 güven

export function wilsonInterval(wins, n) {
  if (!n) return null;

  const p = wins / n;
  const z2 = Z * Z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));

  const low = (center - margin) / denom;
  const high = (center + margin) / denom;

  return {
    low: Math.max(0, low * 100),
    high: Math.min(100, high * 100),
  };
}
