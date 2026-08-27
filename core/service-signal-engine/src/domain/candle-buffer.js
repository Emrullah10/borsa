// Saf fonksiyon — DB/Redis bağımlılığı yok.
//
// Bitget WS candle kanalı mum henüz kapanmadan (dakika içinde fiyat her
// hareket ettiğinde) güncelleme gönderir — borsa WS'lerinde standarttır.
// Bu ayrımı yapmadan gelen her mesajı buffer'a push etmek göstergeleri
// (özellikle ATR/RSI/ADX) bozar — canlı ölçümle doğrulandı (bkz.
// borsa-strategy-validation-plan eki, 2026-08-21).
//
// commitCandle: gelen mumu "hâlâ oluşuyor" (forming) veya "az önce kapandı"
// olarak ayırt eder. Aynı ts ile gelen mesajlar sadece forming'i günceller
// (buffer değişmez, closedCandle null — sinyal üretimi tetiklenmemeli).
// ts değişince önceki forming artık kesinleşmiş demektir: buffer'a eklenir
// ve closedCandle olarak döner (çağıran taraf bunu "yeni kapanmış mum" olarak
// işleyip gösterge/sinyal zincirini SADECE bu durumda çalıştırmalı).
//
// ZAMAN BOŞLUĞU KORUMASI (2026-08-26): Redis/WS bağlantısı koptuğunda buffer
// bellekte donuyor; saatler sonra reconnect olunca eski forming ile yeni gelen
// mum arasında büyük boşluk oluşuyordu. Eski hâlde bu fark edilmeden eski mum
// "kapandı" sayılıp buffer'a ekleniyor, seri delikli hale geliyordu — sonuç:
// ~10 saat bayat fiyatlarla üretilen, gerçek piyasayla ilgisiz sinyaller.
// tfMs verildiğinde boşluk MAX_GAP_MULTIPLIER katını aşarsa seri güvenilmez
// kabul edilir: buffer sıfırlanır, closedCandle null döner (sinyal tetiklenmez).
const MAX_GAP_MULTIPLIER = 3;

export function commitCandle({ buffer, forming, incoming, maxSize, tfMs }) {
  if (!forming) {
    return { buffer, forming: incoming, closedCandle: null };
  }
  if (forming.ts === incoming.ts) {
    return { buffer, forming: incoming, closedCandle: null };
  }

  if (tfMs && forming.ts != null && incoming.ts != null) {
    const gap = incoming.ts - forming.ts;
    if (gap > tfMs * MAX_GAP_MULTIPLIER) {
      // Seride delik var — biriken buffer artık gerçek fiyat serisini temsil
      // etmiyor. Sıfırdan doldurulması gerekir; bu arada sinyal üretilmez.
      return { buffer: [], forming: incoming, closedCandle: null };
    }
  }

  const nextBuffer = [...buffer, forming].slice(-maxSize);
  return { buffer: nextBuffer, forming: incoming, closedCandle: forming };
}
