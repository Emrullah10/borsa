/**
 * Trade listesini kronolojik olarak train/test'e böler (walk-forward doğrulama).
 * Bölme trade'lerin kendi zaman aralığından türetilir (duvar saatinden değil) —
 * saf ve test edilebilir kalır. Parametreler train'de seçilir, test'te (görülmemiş
 * dönemde) değerlendirilir; test metrikleri train'in çok altındaysa curve-fit
 * şüphesi vardır (bkz. borsa-strategy-validation-plan Faz 2).
 *
 * @param {Array<{timestamp:number}>} trades
 * @param {number} testFraction - dönemin sonundan test'e ayrılan oran (varsayılan 1/3)
 */
export function splitTrainTest(trades, testFraction = 1 / 3) {
  if (!trades.length) return { trainTrades: [], testTrades: [], splitTs: null };

  const timestamps = trades.map((t) => t.timestamp);
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);
  const splitTs = minTs + (maxTs - minTs) * (1 - testFraction);

  return {
    trainTrades: trades.filter((t) => t.timestamp < splitTs),
    testTrades: trades.filter((t) => t.timestamp >= splitTs),
    splitTs,
  };
}
