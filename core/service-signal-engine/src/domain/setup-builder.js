// Eski: 1.5 → gürültü stopları 2dk'da tetikleniyordu. 2.5× ATR daha geniş stop = daha az noise kayıp.
const ATR_STOP_MULT_DEFAULT = 2.5;
const MIN_TARGET_PCT = 0.01; // Hedef girişten en az %1 uzakta olmalı

// Varsayılan geriye-uyumluluk için 0.0008'de bırakıldı, ama bu değer YANILTICI:
// eskiden "maker" diye etiketliydi oysa tüm dolumlar TAKER. Muhasebe tarafı
// (evaluateSimOutcome / getSignalStats) 2*takerFee + kayma kullanıyor → gerçek
// gidiş-dönüş maliyet ~0.0018. Yani bu kapı muhasebeden ~2× GEVŞEKTİ.
// boot.js artık bot_config'ten hesaplayıp feeRoundtrip parametresiyle geçiyor.
const FEE_ROUNDTRIP = 0.0008;
// Faz B1 (yapısal onarım, 2026-09-02): eski MIN_STOP_PCT_DEFAULT=0.025 mutlak
// bir yüzde eşiğiydi — "stop en az fiyatın %2.5'i olsun" diyordu. Bu, likit
// coinleri (BTC 5m ATR%~0.11) yapısal olarak eleyip botu sadece ATR%>~1 olan
// Doğru soru "stop büyük mü" değil "fee, riskin makul bir payını mı yiyor" —
// bu yüzden mutlak yüzde yerine MALİYET ORANI kapısı kullanılır: feeR (fee'nin
// stop mesafesine oranı) belli bir tavanı aşmasın. Aynı mantık her fiyat
// seviyesinde ve her zaman diliminde (5m/15m/1h) tutarlı çalışır.
const MAX_COST_RATIO_DEFAULT = 0.10;

// Eski: 1.8 — yüksek hedef ama nadiren ulaşılıyor (%42 WR).
// 1.2 RR ile hedefler daha sık tutturulur → WR %55+ hedefi.
const TARGET_RR_DEFAULT = 1.2;

// --- Katman 3: Destek/Direnç kapağı ---
// Hedef, yoldaki S/R seviyesini aşmasın (fiyat oraya varmadan döner)
export function applySRCap(direction, entry, rawTarget, stop, support, resistance) {
  let cappedTarget = rawTarget;

  if (direction === 'long' && resistance != null) {
    // Direnç hedeften yakınsa ve girişin üstündeyse, hedefi sınırla
    if (resistance < rawTarget && resistance > entry) {
      cappedTarget = resistance;
    }
  }
  if (direction === 'short' && support != null) {
    // Destek hedeften yakınsa ve girişin altındaysa, hedefi sınırla
    if (support > rawTarget && support < entry) {
      cappedTarget = support;
    }
  }

  const reward = Math.abs(cappedTarget - entry);
  const risk   = Math.abs(entry - stop);
  const cappedRR = risk > 0 ? reward / risk : 0;

  return { cappedTarget, cappedRR, srCapped: cappedTarget !== rawTarget };
}

// --- Ana fonksiyon ---
export function buildSetup({
  direction,
  currentPrice,
  atr,
  supportLevel,
  resistanceLevel,
  maxCostRatio = MAX_COST_RATIO_DEFAULT,
  requireSrCap = false,
  atrStopMult = ATR_STOP_MULT_DEFAULT,
  targetRR = TARGET_RR_DEFAULT,
  feeRoundtrip = FEE_ROUNDTRIP,
}) {
  const stopDist = atr * atrStopMult;

  const dynamicRR = targetRR;

  const rawTargetDist = stopDist * dynamicRR;

  let stopPrice, rawTargetPrice;
  if (direction === 'long') {
    stopPrice      = parseFloat((currentPrice - stopDist).toFixed(8));
    rawTargetPrice = parseFloat((currentPrice + rawTargetDist).toFixed(8));
  } else {
    stopPrice      = parseFloat((currentPrice + stopDist).toFixed(8));
    rawTargetPrice = parseFloat((currentPrice - rawTargetDist).toFixed(8));
  }

  // S/R kapağı uygula
  const { cappedTarget, cappedRR, srCapped } = applySRCap(
    direction, currentPrice, rawTargetPrice, stopPrice,
    supportLevel ?? null, resistanceLevel ?? null,
  );

  const targetPrice = parseFloat(cappedTarget.toFixed(8));
  const risk   = Math.abs(currentPrice - stopPrice);
  const reward = Math.abs(targetPrice - currentPrice);
  const rrRatio = parseFloat((reward / risk).toFixed(3));

  const targetPct = reward / currentPrice;
  const meetsMinTarget = targetPct >= MIN_TARGET_PCT;
  const meetsMinRR = rrRatio >= 1.0; // S/R cap sonrası R/R < 1 ise sinyal iptal

  // Fee-aware filtre (maliyet oranı): stop dar olunca fee R'nin büyük kısmını yer.
  // Mutlak yüzde eşiği yerine feeR (fee'nin stop mesafesine oranı) tavanı kullanılır —
  // böylece BTC 1h (ATR%~0.5) geçebilirken BTC 5m (ATR%~0.11) elenir, coin fiyat
  // seviyesinden bağımsız olarak tutarlı çalışır.
  const stopPct = risk / currentPrice;
  const feeR = stopPct > 0 ? feeRoundtrip / stopPct : Infinity;
  const meetsFeeFloor = feeR <= maxCostRatio;

  // S/R kapaksız ("açık sahada") sinyaller canlı veride sistematik olarak kötü
  // performans gösteriyor (kapaklı ~%46 WR vs kapaksız ~%33 WR — 2026-07-13).
  // requireSrCap=false iken bu gate her zaman true döner (davranış-koruma).
  const meetsSrCapRequirement = !requireSrCap || srCapped;

  return {
    direction,
    entryPrice: currentPrice,
    stopPrice,
    targetPrice,
    rrRatio,
    stopDist,
    targetDist: reward,
    targetPct,
    meetsMinTarget,
    meetsMinRR,
    meetsFeeFloor,
    meetsSrCapRequirement,
    stopPct,
    feeR: parseFloat(feeR.toFixed(4)),
    dynamicRR: parseFloat(dynamicRR.toFixed(3)),
    srCapped,
  };
}
