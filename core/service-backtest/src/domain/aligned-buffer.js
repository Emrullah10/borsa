// Backtest'te düşük-frekanslı bir mum serisini (örn. 4h/5m), yüksek-frekanslı
// ana döngünün (1m) zaman damgasına göre lookahead'sız hizalar.
// candles ts'e göre artan sırada olmalı (fetchCandles zaten böyle döner).
export function makeAlignedBuffer(candles, windowSize) {
  let pointer = 0; // candles[pointer] henüz dahil edilmemiş ilk aday

  function at(timestampMs) {
    while (pointer < candles.length && candles[pointer].timestamp <= timestampMs) {
      pointer++;
    }
    const start = Math.max(0, pointer - windowSize);
    return candles.slice(start, pointer);
  }

  return { at };
}
