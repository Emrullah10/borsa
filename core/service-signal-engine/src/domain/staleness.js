// Saf fonksiyon — mum verisinin bayat olup olmadığını belirler.
//
// NEDEN VAR (2026-08-26 olayı): signal-engine ~10 SAAT boyunca donmuş mum
// buffer'ıyla sinyal üretti. ONGUSDT sinyali entry_price=0.09261 ile kaydedildi
// ama o an gerçek Bitget fiyatı 0.1070'ti (%13 sapma). Göstergeler (ema9, vwap)
// de aynı bayat seviyeye göre hesaplandığı için sinyal "tutarlı ama gerçek
// piyasayla ilgisiz" çıktı — panelde normal görünüyordu, kimse fark etmedi.
//
// Kodda hiçbir yerde "bu mum ne kadar eski" kontrolü yoktu; bu yüzden hata
// sessizce sürdü ve ölçülen win-rate'i kirletti. Sinyal üretmeden ÖNCE bu
// kontrol çalışmalı: bayat veriyle üretilen sinyal, yanlış sinyalden beterdir
// çünkü sistem kendine güveniyormuş gibi davranır.

// Timeframe başına tolerans: mum aralığının ~2 katı + ağ payı.
// WS normal çalışırken her tick geldiğinde ts tazelenir, bu eşiklere asla
// yaklaşılmaz. Eşiğin aşılması = akış kopmuş demektir.
export const MAX_CANDLE_AGE_MS = {
  '1m': 5 * 60_000,    // 5 dk
  '5m': 15 * 60_000,   // 15 dk
  '15m': 45 * 60_000,  // 45 dk
  '4h': 9 * 3600_000,  // 9 saat
};

const DEFAULT_MAX_AGE_MS = 15 * 60_000;

/**
 * @param {{ts:number|null|undefined, tf:string, now?:number}} p
 * @returns {boolean} true = bayat, sinyal üretilmemeli
 */
export function isCandleStale({ ts, tf, now = Date.now() }) {
  if (ts == null || !Number.isFinite(Number(ts))) return true; // veri yoksa güvenli taraf
  const maxAge = MAX_CANDLE_AGE_MS[tf] ?? DEFAULT_MAX_AGE_MS;
  return (now - Number(ts)) > maxAge;
}

// Faz 3.2 (B7/B8 tekrarını önleme): funding/OI/LSR mesajları hiç zaman damgası
// taşımıyordu (bkz. make-publisher.js — publishFunding/publishOI/publishLongShortRatio).
// Eksik/durmuş veri sessizce nötr bir sabite (funding=0, OI=0, LSR=0.5/0.5) düşüyordu;
// bu, LSR'nin (bug-170) ve OI'nin (bug-171) aylarca fark edilmemesinin kök nedeniydi —
// "veri var ama nötr" ile "veri hiç yok" ayrımı görünmüyordu.
//
// isMarketDataStale genel amaçlı bir tazelik kontrolüdür — herhangi bir market-data
// kaynağının (funding/oi/lsr) state'ine, mesajın ALINDIĞI zamanı (receivedAt) işaretleyip
// uygulanır. Sinyal üretiminden ÖNCE çağrılmalı; bayatsa o kaynak sessizce nötre
// düşmek yerine sinyal üretimi tamamen durdurulmalı (isCandleStale ile aynı desen).
export const MAX_MARKET_DATA_AGE_MS = 15 * 60_000; // 15 dk — LSR 5dk'da bir poll ediliyor, 3× tolerans

export function isMarketDataStale({ receivedAt, now = Date.now() }) {
  if (receivedAt == null || !Number.isFinite(Number(receivedAt))) return true;
  return (now - Number(receivedAt)) > MAX_MARKET_DATA_AGE_MS;
}
