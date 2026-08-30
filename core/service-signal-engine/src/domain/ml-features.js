// Faz 3.1 (feature logging): meta-etiketleyici (Faz 3.3, LightGBM) için
// indicators_snapshot'a eklenecek ek feature'lar. Saf fonksiyon.
//
// İLKE (Faz 3.2, "sahte veri yok"): bu sistemde gerçekten akmayan bir veri
// (orderbook spread — hiçbir kod bunu çekmiyor) SESSİZCE 0 ya da varsayılan bir
// değere düşmez, açıkça `null` döner. B7/B8'deki hata tam olarak buydu: eksik
// veri (LSR) sessizce nötr bir sabite (0.5) düşüyordu ve aylarca fark edilmedi
// çünkü "veri var ama nötr" ile "veri hiç yok" ayrımı hiçbir yerde görünmüyordu.
// `_provenance` alanı her feature için bu ayrımı açıkça taşır: 'computed'
// (gerçek veriden hesaplandı) | 'unavailable' (bu sistemde hiç yok).

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr, m) {
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function pearsonCorrelation(a, b) {
  if (a.length !== b.length || a.length < 2) return null;
  const ma = mean(a), mb = mean(b);
  let num = 0, denomA = 0, denomB = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    num += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  const denom = Math.sqrt(denomA * denomB);
  return denom > 0 ? num / denom : null;
}

/**
 * @param {object} p
 * @param {Array<{timestamp,open,high,low,close,volume}>} p.candles - en az son N mum
 * @param {number} [p.fundingRate] - anlık funding rate
 * @param {Array<{timestamp,rate}>} [p.fundingHistory] - z-score için geçmiş funding
 * @param {number} [p.oiDelta1h] - Faz 2.1'in 1 saatlik oiDelta'sı (aynen taşınır)
 * @param {number} [p.currentPrice]
 * @param {number} [p.supportLevel]
 * @param {number} [p.resistanceLevel]
 * @param {number[]} [p.btcCloses] - candles ile AYNI uzunlukta, aynı zaman hizasında BTC kapanışları
 * @param {number} [p.volumeUsdt24h] - sembolün 24s USDT hacmi (likidite kademesi için)
 */
export function calcMlFeatures({
  candles, fundingRate, fundingHistory, oiDelta1h,
  currentPrice, supportLevel, resistanceLevel, btcCloses, volumeUsdt24h,
}) {
  const provenance = {};

  // Funding z-score
  let fundingZScore = null;
  if (fundingRate != null && fundingHistory?.length >= 2) {
    const rates = fundingHistory.map((f) => f.rate);
    const m = mean(rates);
    const sd = stdDev(rates, m);
    fundingZScore = sd > 0 ? (fundingRate - m) / sd : 0;
  }
  provenance.fundingZScore = fundingZScore != null ? 'computed' : 'unavailable';

  // OI 1 saatlik delta — Faz 2.1'de zaten doğru hesaplanıyor, burada aynen taşınır
  provenance.oiDelta1h = oiDelta1h != null ? 'computed' : 'unavailable';

  // Gerçekleşmiş volatilite: log-return std'si
  let realizedVolatility = null;
  if (candles?.length >= 2) {
    const logReturns = [];
    for (let i = 1; i < candles.length; i++) {
      const prev = candles[i - 1].close, curr = candles[i].close;
      if (prev > 0 && curr > 0) logReturns.push(Math.log(curr / prev));
    }
    if (logReturns.length >= 1) {
      realizedVolatility = stdDev(logReturns, mean(logReturns));
    }
  }
  provenance.realizedVolatility = realizedVolatility != null ? 'computed' : 'unavailable';

  // Günün saati (UTC) — son mumun timestamp'inden
  let hourOfDayUtc = null;
  if (candles?.length) {
    hourOfDayUtc = new Date(candles[candles.length - 1].timestamp).getUTCHours();
  }
  provenance.hourOfDayUtc = hourOfDayUtc != null ? 'computed' : 'unavailable';

  // BTC korelasyonu — candles ile AYNI uzunlukta olmalı, aksi halde hizalama garantisi yok
  let btcCorrelation = null;
  if (candles?.length && btcCloses?.length === candles.length) {
    btcCorrelation = pearsonCorrelation(candles.map((c) => c.close), btcCloses);
  }
  provenance.btcCorrelation = btcCorrelation != null ? 'computed' : 'unavailable';

  // S/R uzaklığı (yüzde)
  let distToSupportPct = null, distToResistancePct = null;
  if (currentPrice != null && currentPrice > 0) {
    if (supportLevel != null) distToSupportPct = (currentPrice - supportLevel) / currentPrice;
    if (resistanceLevel != null) distToResistancePct = (resistanceLevel - currentPrice) / currentPrice;
  }
  provenance.distToSupportPct = distToSupportPct != null ? 'computed' : 'unavailable';
  provenance.distToResistancePct = distToResistancePct != null ? 'computed' : 'unavailable';

  // Sembol likidite kademesi — bu sistemde 24s hacim verisi şu an HİÇBİR YERDE
  // taşınmıyor (bitget-ws.js sadece anlık ticker hacmini sıralama için kullanıyor,
  // sinyal başına kaydetmiyor). volumeUsdt24h verilmezse null.
  let liquidityTier = null;
  if (volumeUsdt24h != null) {
    liquidityTier = volumeUsdt24h >= 50_000_000 ? 'high' : volumeUsdt24h >= 1_000_000 ? 'mid' : 'low';
  }
  provenance.liquidityTier = liquidityTier != null ? 'computed' : 'unavailable';

  // Spread — bu sistemde orderbook verisi HİÇ akmıyor (ne WS ne REST'te). Hiçbir
  // girdi parametresi bile yok — her zaman 'unavailable', asla sessizce 0.
  const spreadPct = null;
  provenance.spreadPct = 'unavailable';

  return {
    fundingZScore,
    oiDelta1h: oiDelta1h ?? null,
    realizedVolatility,
    hourOfDayUtc,
    btcCorrelation,
    distToSupportPct,
    distToResistancePct,
    liquidityTier,
    spreadPct,
    _provenance: provenance,
  };
}
