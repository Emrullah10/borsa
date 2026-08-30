import { describe, it, expect } from 'vitest';
import { calcMlFeatures } from '../../src/domain/ml-features.js';

// Faz 3.1 (feature logging): meta-etiketleyici (Faz 3.3) için indicators_snapshot'a
// eklenecek ek feature'lar. Saf fonksiyon — DB/Redis bağımlılığı yok, elde HANGİ
// veri varsa ondan hesaplanır. Gerçekten mevcut olmayan bir veri (örn. orderbook
// spread — bu sistemde hiç akmıyor) SESSİZCE 0 ya da uydurma bir değer DEĞİL,
// açıkça null döner — "sahte veri yok" ilkesi burada da geçerli.
describe('calcMlFeatures', () => {
  const baseCandles = Array.from({ length: 30 }, (_, i) => ({
    timestamp: 1_700_000_000_000 + i * 60_000,
    open: 100 + i * 0.1, high: 100.5 + i * 0.1, low: 99.5 + i * 0.1, close: 100.2 + i * 0.1, volume: 100,
  }));

  it('funding z-score: fundingHistory verilirse ortalama/std\'den z-score hesaplar', () => {
    const fundingHistory = [
      { timestamp: 1000, rate: 0.0001 },
      { timestamp: 2000, rate: 0.0002 },
      { timestamp: 3000, rate: 0.0001 },
      { timestamp: 4000, rate: 0.0005 }, // aykırı değer
    ];
    const f = calcMlFeatures({ candles: baseCandles, fundingRate: 0.0005, fundingHistory });
    expect(f.fundingZScore).not.toBeNull();
    expect(f.fundingZScore).toBeGreaterThan(0); // mevcut rate ortalamanın üstünde
  });

  it('fundingHistory boşsa veya yoksa fundingZScore null döner (uydurma yok)', () => {
    const f = calcMlFeatures({ candles: baseCandles, fundingRate: 0.0001, fundingHistory: [] });
    expect(f.fundingZScore).toBeNull();
  });

  it('1 saatlik OI değişimi verilirse aynen taşınır (oiDelta zaten 1h pencereli — Faz 2.1)', () => {
    const f = calcMlFeatures({ candles: baseCandles, oiDelta1h: 50000 });
    expect(f.oiDelta1h).toBe(50000);
  });

  it('gerçekleşmiş volatilite: son N mumun log-return std\'si', () => {
    const f = calcMlFeatures({ candles: baseCandles });
    expect(f.realizedVolatility).not.toBeNull();
    expect(f.realizedVolatility).toBeGreaterThanOrEqual(0);
  });

  it('yetersiz mumda (< 2) realizedVolatility null döner', () => {
    const f = calcMlFeatures({ candles: [baseCandles[0]] });
    expect(f.realizedVolatility).toBeNull();
  });

  it('günün saati: son mumun timestamp\'inden UTC saat (0-23)', () => {
    const f = calcMlFeatures({ candles: baseCandles });
    const expectedHour = new Date(baseCandles[baseCandles.length - 1].timestamp).getUTCHours();
    expect(f.hourOfDayUtc).toBe(expectedHour);
  });

  it('BTC korelasyonu: btcCloses verilirse Pearson korelasyonu hesaplar', () => {
    const btcCloses = baseCandles.map((c) => c.close * 700); // mükemmel pozitif korelasyon
    const f = calcMlFeatures({ candles: baseCandles, btcCloses });
    expect(f.btcCorrelation).not.toBeNull();
    expect(f.btcCorrelation).toBeCloseTo(1, 1);
  });

  it('btcCloses verilmezse veya boyu uyuşmazsa btcCorrelation null döner (uydurma yok)', () => {
    const f = calcMlFeatures({ candles: baseCandles, btcCloses: [1, 2, 3] });
    expect(f.btcCorrelation).toBeNull();
  });

  it('S/R uzaklığı: currentPrice + supportLevel/resistanceLevel verilirse yüzde uzaklık', () => {
    const f = calcMlFeatures({
      candles: baseCandles, currentPrice: 100, supportLevel: 95, resistanceLevel: 110,
    });
    expect(f.distToSupportPct).toBeCloseTo(0.05, 4);
    expect(f.distToResistancePct).toBeCloseTo(0.10, 4);
  });

  it('supportLevel/resistanceLevel yoksa null döner', () => {
    const f = calcMlFeatures({ candles: baseCandles, currentPrice: 100 });
    expect(f.distToSupportPct).toBeNull();
    expect(f.distToResistancePct).toBeNull();
  });

  it('sembol likidite kademesi: volumeUsdt24h verilirse eşiklere göre sınıflandırır', () => {
    expect(calcMlFeatures({ candles: baseCandles, volumeUsdt24h: 100_000_000 }).liquidityTier).toBe('high');
    expect(calcMlFeatures({ candles: baseCandles, volumeUsdt24h: 5_000_000 }).liquidityTier).toBe('mid');
    expect(calcMlFeatures({ candles: baseCandles, volumeUsdt24h: 100_000 }).liquidityTier).toBe('low');
  });

  it('volumeUsdt24h verilmezse liquidityTier null döner (uydurma yok — gerçek veri bu sistemde yok)', () => {
    const f = calcMlFeatures({ candles: baseCandles });
    expect(f.liquidityTier).toBeNull();
  });

  it('spread: bu sistemde orderbook verisi HİÇ akmıyor — her zaman null, sessizce 0 DEĞİL', () => {
    const f = calcMlFeatures({ candles: baseCandles });
    expect(f.spreadPct).toBeNull();
  });

  it('her feature bir provenance (source) etiketi taşır — hangi veri gerçek hangisi eksik belli olsun', () => {
    const f = calcMlFeatures({ candles: baseCandles, fundingRate: 0.0001, fundingHistory: [{ timestamp: 1, rate: 0.0001 }] });
    expect(f._provenance).toBeDefined();
    expect(f._provenance.spreadPct).toBe('unavailable');
    expect(f._provenance.realizedVolatility).toBe('computed');
  });
});
