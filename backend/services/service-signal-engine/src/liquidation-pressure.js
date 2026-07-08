const FUNDING_NORMAL = 0.0001;
const FUNDING_EXTREME = 0.003;
// Aşırı funding: herkes aynı yönde → squeeze riski → contrarian sinyal
const FUNDING_VERY_EXTREME = 0.005;

function clamp(v, min = 0, max = 1) {
  return Math.min(max, Math.max(min, v));
}

export function calcLiquidationPressure({ fundingRate, oiDelta, longRatio, shortRatio, priceChange }) {
  const fundingNorm = clamp((Math.abs(fundingRate) - FUNDING_NORMAL) / (FUNDING_EXTREME - FUNDING_NORMAL));
  const fundingBiasLong = fundingRate < 0;

  const imbalance = Math.abs(longRatio - shortRatio);
  const oiPressure = clamp(Math.abs(oiDelta) / 10000);
  const priceOIAlignment = Math.abs(priceChange) > 0.005 ? 0.2 : 0;

  const rawScore = 0.35 * fundingNorm + 0.30 * imbalance + 0.25 * oiPressure + 0.10 * priceOIAlignment;
  const score = clamp(0.5 + rawScore * 0.5);

  let direction = 'neutral';
  let fundingContrarian = false;

  const longSqueezeSignals = !fundingBiasLong && longRatio > 0.6 && priceChange > 0;
  const shortSqueezeSignals = fundingBiasLong && shortRatio > 0.6 && priceChange < 0;

  if (longSqueezeSignals || (fundingRate > FUNDING_NORMAL * 5 && longRatio > 0.6)) {
    direction = 'short';
  } else if (shortSqueezeSignals || (fundingRate < -FUNDING_NORMAL * 5 && shortRatio > 0.6)) {
    direction = 'long';
  }

  // Funding aşırı ise ve henüz yön belirlenemediyse contrarian devreye girer.
  // Çift-sayma koruması: sadece direction hâlâ 'neutral' iken uygula.
  if (direction === 'neutral') {
    if (fundingRate > FUNDING_VERY_EXTREME) {
      // Herkes long → uzun pozisyonlar sıkışacak → short lehine
      direction = 'short';
      fundingContrarian = true;
    } else if (fundingRate < -FUNDING_VERY_EXTREME) {
      // Herkes short → short pozisyonlar sıkışacak → long lehine
      direction = 'long';
      fundingContrarian = true;
    }
  }

  return {
    score: clamp(score),
    direction,
    components: { fundingNorm, imbalance, oiPressure, fundingBiasLong, fundingContrarian },
  };
}
