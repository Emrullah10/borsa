// avg_r / avg_sim_r için %95 güven aralığı.
//
// NEDEN: Kârlılığı belirleyen metrik win_rate DEĞİL, işlem başına ortalama R.
// Ama şimdiye kadar belirsizlik SADECE win_rate'e (Wilson) uygulanıyordu —
// yani asıl karar metriğinin hata payı hiçbir yerde görünmüyordu.
// +0.037R gibi ince bir edge, n=110'da sıfırdan ayırt edilemez; bunu görmeden
// "sistem kârlı" demek yanıltıcı olur.
//
// YÖNTEM: R sonuçları yaklaşık iki-noktalı dağılımdır (kazanç +winR, kayıp -1).
// Bu dağılımın standart sapması kapalı formülle hesaplanabilir; ham işlem
// listesi gerekmez (/stats endpoint'i zaten sadece özet döndürüyor).
// Timeout'lar ~0R kabul edilir — hafif iyimser ama makul.

const Z = 1.96; // %95 güven

/**
 * @param {object} p
 * @param {number|null} p.avgR   - gözlenen ortalama R (avg_sim_r tercih edilir)
 * @param {number} p.tpHit
 * @param {number} p.slHit
 * @param {number} p.timeout
 * @param {number} [p.winR=1.2] - kazanan işlemin R'si (targetRR)
 * @returns {{low:number, high:number, stdErr:number, n:number, provenPositive:boolean}|null}
 */
export function avgRInterval({ avgR, tpHit = 0, slHit = 0, timeout = 0, winR = 1.2 }) {
  const n = (tpHit ?? 0) + (slHit ?? 0) + (timeout ?? 0);
  if (!n || avgR == null || !Number.isFinite(avgR)) return null;

  // Gözlenen sonuç dağılımının varyansı: E[R²] - (E[R])²
  const pWin = tpHit / n;
  const pLoss = slHit / n;
  const pTimeout = timeout / n;

  const eR2 = pWin * winR * winR + pLoss * 1 + pTimeout * 0;
  const variance = Math.max(0, eR2 - avgR * avgR);
  const stdErr = Math.sqrt(variance / n);
  const margin = Z * stdErr;

  const low = avgR - margin;

  return {
    low,
    high: avgR + margin,
    stdErr,
    n,
    // Edge istatistiksel olarak kanıtlandı mı? Faz 3 karar kapısının kriteri.
    provenPositive: low > 0,
  };
}
