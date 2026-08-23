import { describe, it, expect } from 'vitest';
import { avgRInterval } from './avgRInterval.js';

describe('avgRInterval', () => {
  // Kârı belirleyen metrik avg_sim_r — ama şimdiye kadar hiçbir yerde hata payı
  // yoktu (Wilson SADECE win_rate'e uygulanıyordu). +0.037R gibi ince bir edge'in
  // sıfırdan ayırt edilip edilemediğini görmek için bu şart.

  it('n yoksa null döner', () => {
    expect(avgRInterval({ avgR: 0.1, tpHit: 0, slHit: 0, timeout: 0 })).toBeNull();
  });

  it('avgR null ise null döner', () => {
    expect(avgRInterval({ avgR: null, tpHit: 10, slHit: 10, timeout: 0 })).toBeNull();
  });

  it('aralık ortalamayı içerir ve simetriktir', () => {
    const r = avgRInterval({ avgR: 0.15, tpHit: 57, slHit: 42, timeout: 11, winR: 1.2 });
    expect(r.low).toBeLessThan(0.15);
    expect(r.high).toBeGreaterThan(0.15);
    expect(r.high - 0.15).toBeCloseTo(0.15 - r.low, 6);
  });

  it('örneklem büyüdükçe aralık daralır', () => {
    const kucuk = avgRInterval({ avgR: 0.15, tpHit: 12, slHit: 8, timeout: 2, winR: 1.2 });
    const buyuk = avgRInterval({ avgR: 0.15, tpHit: 120, slHit: 80, timeout: 20, winR: 1.2 });
    expect(buyuk.high - buyuk.low).toBeLessThan(kucuk.high - kucuk.low);
  });

  it('ince edge küçük örneklemde sıfırı KAPSAR (kanıtlanmamış)', () => {
    // Canlı durum: n=110, avg_sim_r=+0.037 → alt sınır negatif olmalı
    const r = avgRInterval({ avgR: 0.037, tpHit: 57, slHit: 42, timeout: 11, winR: 1.2 });
    expect(r.low).toBeLessThan(0);
    expect(r.provenPositive).toBe(false);
  });

  it('güçlü edge + büyük örneklemde sıfırın ÜSTÜNDE (kanıtlanmış)', () => {
    const r = avgRInterval({ avgR: 0.30, tpHit: 600, slHit: 400, timeout: 50, winR: 1.2 });
    expect(r.low).toBeGreaterThan(0);
    expect(r.provenPositive).toBe(true);
  });
});
