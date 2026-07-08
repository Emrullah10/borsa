const TF_MS = { '1m': 60_000, '5m': 300_000, '15m': 900_000 };
const WINDOW_CANDLES = 2;      // 2 mum
const DISTANCE_FRACTION = 0.5; // riskin %50'si

/**
 * Bir sinyalin giriş penceresinin hâlâ geçerli olup olmadığını hesaplar.
 *
 * @param {object} signal - { triggerTimeframe, createdAt, entryPrice, stopPrice, direction }
 * @param {number|null} extremePrice - sinyal süresince görülen uç fiyat
 *   (long için görülen en yüksek, short için görülen en düşük)
 * @param {number} now - Date.now() (test edilebilirlik için parametre)
 * @returns {{ state: 'fresh'|'missed', reason: 'time'|'distance'|null }}
 */
export function getEntryValidity(signal, extremePrice, now = Date.now()) {
  const tfMs = TF_MS[signal.triggerTimeframe] ?? TF_MS['5m'];
  const age = now - new Date(signal.createdAt).getTime();

  if (age > tfMs * WINDOW_CANDLES) return { state: 'missed', reason: 'time' };

  if (extremePrice != null) {
    const risk = Math.abs(signal.entryPrice - signal.stopPrice);
    const moved =
      signal.direction === 'long'
        ? extremePrice - signal.entryPrice
        : signal.entryPrice - extremePrice;
    if (risk > 0 && moved > risk * DISTANCE_FRACTION) {
      return { state: 'missed', reason: 'distance' };
    }
  }

  return { state: 'fresh', reason: null };
}
