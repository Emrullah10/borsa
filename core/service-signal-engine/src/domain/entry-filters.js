// Saf fonksiyon — DB/Redis bağımlılığı yok.
//
// Canlı istatistiklerin (2026-07-13 kırılım analizi) gösterdiği iki sistematik
// kayıp kohortunu eler:
//  - Aşırı-uzama: bot bandın tepesinden long, dibinden short açıyordu
//    (kaybeden long'larda BB %B ortalama 0.93 / RSI 70.7, kazananlarda 0.85 / 66.0).
//  - ADX tükenme: yüksek ADX'te giriş = trendin sonuna yakın giriş
//    (kaybedenlerde ADX ~66-76, kazananlarda ~55-58).
//
// Parametreler bot_config'ten gelir; burada sadece güvenli default'lar tanımlı.
export const DEFAULT_FILTER_PARAMS = {
  maxPbLong: 0.85,
  minPbShort: 0.15,
  rsiMaxLong: 70,
  rsiMinShort: 30,
  adxMax: 65,
};

export function applyEntryFilters({ direction, indicators, params }) {
  const p = { ...DEFAULT_FILTER_PARAMS, ...(params ?? {}) };
  const { bb, rsi, adx } = indicators ?? {};

  if (adx != null && adx > p.adxMax) {
    return { allowed: false, reason: 'adx-exhaustion' };
  }

  if (direction === 'long') {
    if (bb?.pb != null && bb.pb > p.maxPbLong) {
      return { allowed: false, reason: 'overextension' };
    }
    if (rsi != null && rsi > p.rsiMaxLong) {
      return { allowed: false, reason: 'overextension' };
    }
  } else if (direction === 'short') {
    if (bb?.pb != null && bb.pb < p.minPbShort) {
      return { allowed: false, reason: 'overextension' };
    }
    if (rsi != null && rsi < p.rsiMinShort) {
      return { allowed: false, reason: 'overextension' };
    }
  }

  return { allowed: true, reason: null };
}
