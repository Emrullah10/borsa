import { describe, it, expect } from 'vitest';
import {
  mulberry32, mean, std, sharpeAnnualized, maxDrawdown, blockBootstrapMeanCI, percentileRank,
} from '../../../src/domain/lab/stats.js';

describe('mulberry32 (seed\'li RNG — sonuçlar tekrarlanabilir olmalı)', () => {
  it('aynı seed → aynı dizi', () => {
    const a = mulberry32(42); const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('farklı seed → farklı dizi', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
  it('değerler [0,1) aralığında', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('mean / std', () => {
  it('mean', () => expect(mean([1, 2, 3])).toBe(2));
  it('mean boş → 0', () => expect(mean([])).toBe(0));
  it('std örneklem (n-1)', () => expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4));
  it('std <2 değer → 0', () => { expect(std([5])).toBe(0); expect(std([])).toBe(0); });
});

describe('sharpeAnnualized (günlük getiri, 365 gün)', () => {
  it('sabit seri (std=0) → 0, NaN/Infinity değil', () => expect(sharpeAnnualized([0.01, 0.01, 0.01])).toBe(0));
  it('mean/std × √365', () => {
    const xs = [0.011, -0.009, 0.011, -0.009]; // mean 0.001
    expect(sharpeAnnualized(xs)).toBeCloseTo((mean(xs) / std(xs)) * Math.sqrt(365), 6);
  });
  it('<2 gözlem → 0', () => expect(sharpeAnnualized([0.5])).toBe(0));
});

describe('maxDrawdown (toplamsal eşitlik eğrisi)', () => {
  it('tepe → dip düşüşünü döner', () => expect(maxDrawdown([0.1, -0.05, -0.05, 0.2])).toBeCloseTo(0.1, 10));
  it('sürekli yükseliş → 0', () => expect(maxDrawdown([0.1, 0.2, 0.3])).toBe(0));
  it('boş → 0', () => expect(maxDrawdown([])).toBe(0));
});

describe('blockBootstrapMeanCI', () => {
  const noise = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 1 : -1));
  const positive = Array.from({ length: 200 }, (_, i) => 1 + (i % 5) * 0.1);

  it('boş dizi → null', () => expect(blockBootstrapMeanCI([])).toBeNull());
  it('aynı seed → aynı sonuç (tekrarlanabilir)', () => {
    expect(blockBootstrapMeanCI(noise, { seed: 3 })).toEqual(blockBootstrapMeanCI(noise, { seed: 3 }));
  });
  it('güçlü pozitif seride alt sınır > 0', () => expect(blockBootstrapMeanCI(positive).low).toBeGreaterThan(0));
  it('sıfır-ortalamalı gürültüde aralık 0\'ı kapsar', () => {
    const ci = blockBootstrapMeanCI(noise);
    expect(ci.low).toBeLessThan(0); expect(ci.high).toBeGreaterThan(0);
  });
  it('low ≤ mean ≤ high', () => {
    const ci = blockBootstrapMeanCI(positive);
    expect(ci.low).toBeLessThanOrEqual(ci.mean); expect(ci.mean).toBeLessThanOrEqual(ci.high);
  });
  it('daha yüksek güven düzeyi (Bonferroni %98.75) daha GENİŞ aralık verir', () => {
    const wide = blockBootstrapMeanCI(noise, { level: 0.9875, iterations: 4000 });
    const narrow = blockBootstrapMeanCI(noise, { level: 0.95, iterations: 4000 });
    expect(wide.high - wide.low).toBeGreaterThan(narrow.high - narrow.low);
  });
  it('az veri → geniş aralık', () => {
    const few = blockBootstrapMeanCI(noise.slice(0, 20));
    const many = blockBootstrapMeanCI(noise);
    expect(few.high - few.low).toBeGreaterThan(many.high - many.low);
  });
  it('blok bootstrap otokorelasyonlu seride i.i.d.\'den daha geniş aralık verir', () => {
    // 20\'şer günlük + ve − bloklar: güçlü otokorelasyon
    const corr = Array.from({ length: 200 }, (_, i) => (Math.floor(i / 20) % 2 === 0 ? 1 : -1) + (i % 3) * 0.01);
    const iid = blockBootstrapMeanCI(corr, { blockSize: 1, seed: 5 });
    const blk = blockBootstrapMeanCI(corr, { blockSize: 20, seed: 5 });
    expect(blk.high - blk.low).toBeGreaterThan(iid.high - iid.low);
  });
});

describe('percentileRank', () => {
  it('değerin altındaki örneklerin oranı', () => expect(percentileRank(5, [1, 2, 3, 4])).toBe(1));
  it('hepsinden küçükse 0', () => expect(percentileRank(0, [1, 2, 3])).toBe(0));
  it('eşitler yarım sayılır', () => expect(percentileRank(2, [1, 2, 2, 3])).toBe(0.5));
  it('boş örnek → NaN değil 0', () => expect(percentileRank(1, [])).toBe(0));
});
