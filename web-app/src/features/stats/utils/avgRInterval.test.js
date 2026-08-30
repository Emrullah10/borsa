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

  // Faz 0.5 (B5 düzeltmesi): avg_sim_r'nin GERÇEK örneklem boyutu (simN) tp+sl+timeout
  // toplamından (n) çok daha küçük olabilir — repository artık sim_n'i ayrı döndürüyor.
  // Önceden panel bunu ayırt etmiyordu: n=6267 ile hesaplanan CI, gerçek n=869 olan
  // avg_sim_r için ~2.7× dar çıkıyordu — yanlışlıkla "edge kanıtlandı" diyebilirdi.
  describe('simN parametresi (Faz 0.5, B5 düzeltmesi)', () => {
    it('simN verilirse n olarak simN kullanılır, tpHit+slHit+timeout DEĞİL', () => {
      const r = avgRInterval({ avgR: 0.15, tpHit: 6000, slHit: 200, timeout: 67, simN: 869, winR: 1.2 });
      expect(r.n).toBe(869);
    });

    it('simN küçükse (gerçek örneklem küçük) aralık, büyük n varsayımına göre DAHA GENİŞ olur', () => {
      // Aynı avgR, aynı oranlar — ama simN gerçek n'den küçük olduğunda aralık genişlemeli
      const withWrongLargeN = avgRInterval({ avgR: 0.15, tpHit: 6000, slHit: 200, timeout: 67 });
      const withCorrectSmallN = avgRInterval({ avgR: 0.15, tpHit: 6000, slHit: 200, timeout: 67, simN: 869 });
      expect(withCorrectSmallN.high - withCorrectSmallN.low)
        .toBeGreaterThan(withWrongLargeN.high - withWrongLargeN.low);
    });

    it('simN verilmezse eski davranış korunur (n = tpHit+slHit+timeout)', () => {
      const r = avgRInterval({ avgR: 0.15, tpHit: 57, slHit: 42, timeout: 11 });
      expect(r.n).toBe(110);
    });

    it('simN=0 ise null döner (hiç sim veri yok)', () => {
      const r = avgRInterval({ avgR: 0.15, tpHit: 57, slHit: 42, timeout: 11, simN: 0 });
      expect(r).toBeNull();
    });
  });
});
