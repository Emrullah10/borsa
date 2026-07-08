function clamp(v, min = 0, max = 1) {
  return Math.min(max, Math.max(min, v));
}

// Volatiliteye göre dinamik eşik ayarı
// atrPercent = atr / currentPrice
// Yüksek vol → daha katı (daha az ama kaliteli sinyal)
// Düşük vol → daha gevşek (temiz hareket = güvenilir)
export function adaptiveThreshold(baseThreshold, atrPercent) {
  if (atrPercent == null || baseThreshold == null) return baseThreshold ?? 0.65;
  let adjusted = baseThreshold;
  if (atrPercent > 0.015) adjusted += 0.05;       // yüksek volatilite
  else if (atrPercent < 0.005) adjusted -= 0.05;  // düşük volatilite
  return clamp(adjusted, 0.50, 0.85);
}

export function calcConfluence(indicators, liqPressure, threshold, higherTfTrend = null, regime = 'neutral') {
  const { ema9, ema21, ema50, rsi, macd, bb, vwap, currentPrice,
          adx, supportLevel, resistanceLevel, volumeRatio } = indicators;

  // Adaptif eşik: ATR% volatiliteye göre ayarla
  const atrPercent = (indicators.atr && currentPrice) ? indicators.atr / currentPrice : null;
  let effectiveThreshold = adaptiveThreshold(threshold, atrPercent);

  // Rejim filtresi: trende karşı yöne +0.12 bar
  // (regime hesaplaması sonradan yapılacak, şimdi direction henüz bilinmiyor — aşağıda uygulanır)

  let trendScore = 0, trendDir = 'neutral';
  if (ema9 && ema21 && ema50) {
    if (ema9 > ema21 && ema21 > ema50) { trendScore = 1; trendDir = 'long'; }
    else if (ema9 < ema21 && ema21 < ema50) { trendScore = 1; trendDir = 'short'; }
    else { trendScore = 0.4; trendDir = ema9 > ema21 ? 'long' : 'short'; }
  }

  // Momentum: RSI (0.33) + MACD (0.33) + Volume (0.33)
  let momentumScore = 0, momentumDir = 'neutral';
  if (rsi !== null && rsi !== undefined) {
    if (rsi > 50 && rsi < 70) { momentumScore += 0.33; momentumDir = 'long'; }
    else if (rsi < 50 && rsi > 30) { momentumScore += 0.33; momentumDir = 'short'; }
  }
  if (macd) {
    if (macd.histogram > 0) { momentumScore += 0.33; if (momentumDir === 'neutral') momentumDir = 'long'; }
    else if (macd.histogram < 0) { momentumScore += 0.33; if (momentumDir === 'neutral') momentumDir = 'short'; }
  }
  // Volume confirmation: 1.5× ortalama üstü → güçlü hacim
  if (volumeRatio !== null && volumeRatio !== undefined && volumeRatio >= 1.5) {
    momentumScore += 0.33;
  }
  momentumScore = clamp(momentumScore);

  // Price position: BB (0.35) + VWAP (0.35) + S/R proximity (0.30)
  let priceScore = 0, priceDir = 'neutral';
  let nearSupport = false, nearResistance = false;

  if (bb && currentPrice) {
    const bbRange = bb.upper - bb.lower;
    const relPos = bbRange > 0 ? (currentPrice - bb.lower) / bbRange : 0.5;
    if (relPos > 0.5 && relPos < 0.85) { priceScore += 0.35; priceDir = 'long'; }
    else if (relPos < 0.5 && relPos > 0.15) { priceScore += 0.35; priceDir = 'short'; }
  }
  if (vwap && currentPrice) {
    if (currentPrice > vwap) { priceScore += 0.35; if (priceDir === 'neutral') priceDir = 'long'; }
    else { priceScore += 0.35; if (priceDir === 'neutral') priceDir = 'short'; }
  }
  // S/R proximity: fiyat destek/dirence yakınsa (±%1 tolerans) bonus
  if (currentPrice) {
    const srTolerance = 0.01;
    if (supportLevel && Math.abs(currentPrice - supportLevel) / currentPrice <= srTolerance) {
      nearSupport = true;
      priceScore += 0.30;
      if (priceDir === 'neutral') priceDir = 'long';
    }
    if (resistanceLevel && Math.abs(currentPrice - resistanceLevel) / currentPrice <= srTolerance) {
      nearResistance = true;
      priceScore += 0.30;
      if (priceDir === 'neutral') priceDir = 'short';
    }
  }
  priceScore = clamp(priceScore);

  const liqScore = liqPressure?.score ?? 0.5;
  const liqDir   = liqPressure?.direction ?? 'neutral';

  const votes = [trendDir, momentumDir, priceDir, liqDir].filter(d => d !== 'neutral');
  const longVotes  = votes.filter(d => d === 'long').length;
  const shortVotes = votes.filter(d => d === 'short').length;
  const direction  = longVotes > shortVotes ? 'long' : shortVotes > longVotes ? 'short' : 'neutral';

  const alignmentBonus = direction !== 'neutral' && direction === trendDir && direction === momentumDir ? 0.1 : 0;
  const raw = 0.30 * trendScore + 0.25 * momentumScore + 0.20 * priceScore + 0.25 * liqScore + alignmentBonus;
  const score = clamp(raw);

  // Rejim filtresi: trende karşı yöne +0.12 bar (neutral rejimde uygulanmaz)
  const counterTrend = (regime === 'bull' && direction === 'short') ||
                       (regime === 'bear' && direction === 'long');
  if (counterTrend) effectiveThreshold = clamp(effectiveThreshold + 0.12, 0.50, 0.85);

  // Multi-TF gate: 1m sinyali için 5m trend teyidi
  const tfMismatch = higherTfTrend !== null &&
                     higherTfTrend !== 'neutral' &&
                     direction !== 'neutral' &&
                     higherTfTrend !== direction;

  return {
    score,
    direction,
    isCandidate: direction !== 'neutral' && score >= effectiveThreshold && !tfMismatch,
    breakdown: {
      trendScore, momentumScore, priceScore, liqScore,
      trendDir, momentumDir, priceDir, liqDir,
      adxValue: adx ?? null,
      volumeRatio: volumeRatio ?? null,
      nearSupport,
      nearResistance,
      effectiveThreshold,
      higherTfTrend: higherTfTrend ?? null,
      tfMismatch,
      regime,
      counterTrend,
    },
  };
}
