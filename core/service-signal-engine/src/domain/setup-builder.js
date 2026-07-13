const ATR_STOP_MULT = 1.5;
const MIN_TARGET_PCT = 0.01; // Hedef girişten en az %1 uzakta olmalı

const FEE_ROUNDTRIP = 0.0008;       // maker gidiş-dönüş ~%0.08
const MIN_STOP_PCT_DEFAULT = 0.012; // stop >= %1.2 — tek kârlı fee bucket (veri kanıtladı)

// Sabit R/R — confluence skoru ve ADX win rate'i öngörmediği için (veri: 694 sinyal)
const TARGET_RR = 1.8;

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
  minStopPct = MIN_STOP_PCT_DEFAULT,
  requireSrCap = false,
}) {
  const stopDist = atr * ATR_STOP_MULT;

  const dynamicRR = TARGET_RR;

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

  // Fee-aware filtre: stop dar olunca fee R'nin büyük kısmını yer
  const stopPct = risk / currentPrice;
  const feeR = stopPct > 0 ? FEE_ROUNDTRIP / stopPct : Infinity;
  const meetsFeeFloor = stopPct >= minStopPct && (rrRatio - feeR) >= 1.0;

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
