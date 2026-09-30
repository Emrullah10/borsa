import { describe, it, expect } from 'vitest';
import { fundingZScores, detectFundingExtremes } from '../../../src/domain/lab/funding-extreme.js';

const H8 = 8 * 3_600_000;
// Hafif dalgalanan taban seri: ortalama ~0.0001, std ~0.00002
const base = (n, start = 0) => Array.from({ length: n }, (_, i) => ({
  timestamp: start + i * H8, rate: 0.0001 + (i % 2 === 0 ? 0.00002 : -0.00002),
}));

describe('fundingZScores', () => {
  it('ısınma (minPeriods) dolmadan z üretmez', () => {
    const z = fundingZScores(base(40), { window: 90, minPeriods: 30 });
    expect(z.every((p) => p.index >= 30)).toBe(true);
  });

  it('z, GEÇMİŞ pencereye göre hesaplanır — anın kendisi pencereye girmez', () => {
    const s = [...base(60), { timestamp: 60 * H8, rate: 0.001 }];
    const last = fundingZScores(s, { window: 90, minPeriods: 30 }).at(-1);
    expect(last.z).toBeGreaterThan(10); // spike kendi std'sini şişirmiyor
  });

  it('std=0 (tamamen sabit geçmiş) → o nokta atlanır (sonsuz z yok)', () => {
    const flat = Array.from({ length: 50 }, (_, i) => ({ timestamp: i * H8, rate: 0.0001 }));
    flat.push({ timestamp: 50 * H8, rate: 0.001 });
    const z = fundingZScores(flat, { window: 90, minPeriods: 30 });
    expect(z.every((p) => Number.isFinite(p.z))).toBe(true);
    expect(z.find((p) => p.index === 50)).toBeUndefined();
  });

  it('SIZINTI TESTİ: sona gelecek veri eklemek geçmiş z\'leri değiştirmez', () => {
    const s = [...base(70), { timestamp: 70 * H8, rate: 0.0006 }];
    const before = fundingZScores(s, { window: 90, minPeriods: 30 });
    const extended = [...s, { timestamp: 71 * H8, rate: -0.005 }, { timestamp: 72 * H8, rate: 0.009 }];
    const after = fundingZScores(extended, { window: 90, minPeriods: 30 });
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it('pencere sınırlıdır: çok eski rejim unutulur', () => {
    const old = Array.from({ length: 100 }, (_, i) => ({ timestamp: i * H8, rate: 0.01 + (i % 2) * 0.005 })); // yüksek rejim
    const calm = base(90, 100 * H8);
    const spike = [{ timestamp: 190 * H8, rate: 0.0005 }];
    const z = fundingZScores([...old, ...calm, ...spike], { window: 90, minPeriods: 30 }).at(-1);
    expect(z.z).toBeGreaterThan(5); // 100 eski yüksek gözlem penceredeyse z küçük kalırdı
  });
});

describe('detectFundingExtremes', () => {
  it('yüksek pozitif spike → SHORT (long\'lar kalabalık)', () => {
    const sig = detectFundingExtremes([...base(60), { timestamp: 60 * H8, rate: 0.001 }], { zThreshold: 2 });
    expect(sig).toHaveLength(1);
    expect(sig[0]).toMatchObject({ timestamp: 60 * H8, direction: 'short', rate: 0.001 });
    expect(sig[0].z).toBeGreaterThan(2);
  });

  it('yüksek negatif spike → LONG (short\'lar kalabalık)', () => {
    const sig = detectFundingExtremes([...base(60), { timestamp: 60 * H8, rate: -0.001 }], { zThreshold: 2 });
    expect(sig[0]).toMatchObject({ direction: 'long' });
  });

  it('|oran| minAbsRate altındaysa z yüksek olsa da sinyal yok', () => {
    const tiny = Array.from({ length: 60 }, (_, i) => ({ timestamp: i * H8, rate: 0.000001 * (1 + (i % 2)) }));
    tiny.push({ timestamp: 60 * H8, rate: 0.00005 }); // z çok yüksek ama mutlak oran küçük
    expect(detectFundingExtremes(tiny, { zThreshold: 2, minAbsRate: 0.0002 })).toHaveLength(0);
  });

  it('eşik yükseldikçe sinyal sayısı azalır (tekdüze)', () => {
    let s = base(60);
    for (let i = 0; i < 12; i++) s.push({ timestamp: (60 + i) * H8, rate: 0.0001 + (i + 1) * 0.0001 });
    const c2 = detectFundingExtremes(s, { zThreshold: 2, minAbsRate: 0 }).length;
    const c3 = detectFundingExtremes(s, { zThreshold: 3, minAbsRate: 0 }).length;
    expect(c3).toBeLessThanOrEqual(c2);
  });
});
