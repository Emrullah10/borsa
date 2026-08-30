// Backtest'te düşük-frekanslı bir mum serisini (örn. 4h/5m), yüksek-frekanslı
// ana döngünün (1m) zaman damgasına göre lookahead'sız hizalar.
// candles ts'e göre artan sırada olmalı (fetchCandles zaten böyle döner).
//
// Faz 1.1 (B6 düzeltmesi, 2026-08-30): önceki implementasyon durumlu bir pointer
// kullanıyordu (monoton artan, hiç sıfırlanmayan). sweep.js aynı buffer nesnesini
// (regimeBuffer, higherTfBuffer) 27 parametre kombinasyonu × 5 sembol arasında
// PAYLAŞIYORDU — combo #1'in ilk sembolünden sonra pointer diziyi tüketiyor,
// kalan 26 combo'nun TAMAMI o andan itibaren "gelecekteki" mumları görüyordu
// (higherTfTrend confluence.js'te sert kapı olduğu için etkisi büyüktü — sinyaller
// sadece o dönemde "gelecekte doğru çıkan" tek yöne üretiliyordu). 2026-07-13'te
// canlıya alınan parametreler bu sızıntılı sweep'ten seçilmişti.
//
// Düzeltme: durumsuz ikili arama. Aynı buffer'a hangi sırada, kaç kez sorulursa
// sorulsun SADECE geçilen timestampMs'e göre lookahead'siz sonuç döner — paylaşılan
// referans artık sızıntı üretemez. O(log n) sorgu; sweep'in erişim deseni (aynı
// symbol içinde artan ts) için önceki O(1) amortize pointer'dan yavaş ama
// yanlış sonuçtan doğru sonuç her zaman yeğdir.
export function makeAlignedBuffer(candles, windowSize) {
  function at(timestampMs) {
    // İlk indeks: candles[idx].timestamp > timestampMs (yani henüz dahil edilmemiş ilk aday)
    let lo = 0, hi = candles.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (candles[mid].timestamp <= timestampMs) lo = mid + 1;
      else hi = mid;
    }
    return candles.slice(Math.max(0, lo - windowSize), lo);
  }

  return { at };
}
