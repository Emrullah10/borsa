// LONG/SHORT kazanma oranı — /stats endpoint'i tüm sayıları STRING döndürür
// (Postgres COUNT/SUM sonuçları text olarak gelir). Sayıya çevirmeden toplama
// yaparsan (tp + sl) JS bunu string birleştirme sanır: "52"+"37" = "5237",
// 52/5237 = %1.0 gibi anlamsız bir sonuç çıkar. Bu fonksiyon önce parseFloat
// eder, sonra böler — panelde LONG/SHORT kutularının %1.0 göstermesine
// sebep olan bug buydu.
export function directionalWinRate(tp, sl) {
  const t = parseFloat(tp) || 0;
  const s = parseFloat(sl) || 0;
  const total = t + s;
  if (total === 0) return null;
  return ((t / total) * 100).toFixed(1);
}
