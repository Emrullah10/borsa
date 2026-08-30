/**
 * Trade listesini kronolojik olarak train/test'e böler (walk-forward doğrulama).
 *
 * Faz 1.4 (B9 düzeltmesi, 2026-08-30): opsiyonel `range` verilirse split SABİT
 * takvim tarihinden ({rangeStartMs, rangeEndMs}) hesaplanır — sweep.js'te 27
 * parametre kombinasyonu aynı dönem üzerinde karşılaştırılabilir olur. Önceden
 * split, trade'lerin KENDİ min/max ts'inden türetiliyordu; farklı kombinasyonlar
 * farklı trade zaman aralıkları ürettiği için her combo FARKLI bir test dönemi
 * üzerinde değerlendiriliyordu — karşılaştırma anlamsızdı. `range` verilmezse
 * eski davranış (trade min/max) korunur — geriye uyumlu, ama SADECE tek bir
 * combo/trade seti izole değerlendiriliyorsa doğrudur.
 *
 * Parametreler train'de seçilir, test'te (görülmemiş dönemde) değerlendirilir;
 * test metrikleri train'in çok altındaysa curve-fit şüphesi vardır (bkz.
 * borsa-strategy-validation-plan Faz 2).
 *
 * @param {Array<{timestamp:number}>} trades
 * @param {number} [testFraction=1/3] - dönemin sonundan test'e ayrılan oran
 * @param {{rangeStartMs:number, rangeEndMs:number}} [range] - sabit takvim aralığı
 */
export function splitTrainTest(trades, testFraction = 1 / 3, range) {
  if (!trades.length) return { trainTrades: [], testTrades: [], splitTs: null };

  let minTs, maxTs;
  if (range && Number.isFinite(range.rangeStartMs) && Number.isFinite(range.rangeEndMs)) {
    minTs = range.rangeStartMs;
    maxTs = range.rangeEndMs;
  } else {
    const timestamps = trades.map((t) => t.timestamp);
    minTs = Math.min(...timestamps);
    maxTs = Math.max(...timestamps);
  }
  const splitTs = minTs + (maxTs - minTs) * (1 - testFraction);

  return {
    trainTrades: trades.filter((t) => t.timestamp < splitTs),
    testTrades: trades.filter((t) => t.timestamp >= splitTs),
    splitTs,
  };
}
