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
export function commitCandle({ buffer, forming, incoming, maxSize }) {
  if (!forming) {
    return { buffer, forming: incoming, closedCandle: null };
  }
  if (forming.ts === incoming.ts) {
    return { buffer, forming: incoming, closedCandle: null };
  }
  const nextBuffer = [...buffer, forming].slice(-maxSize);
  return { buffer: nextBuffer, forming: incoming, closedCandle: forming };
}
