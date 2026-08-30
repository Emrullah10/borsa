import { describe, it, expect } from 'vitest';
import { splitTrainTest } from '../../src/domain/walk-forward.js';

function trade(ts, outcome = 'WIN') {
  return { timestamp: ts, outcome, r: 1 };
}

describe('splitTrainTest', () => {
  it('trade listesi boşsa boş train/test döner', () => {
    const r = splitTrainTest([]);
    expect(r.trainTrades).toEqual([]);
    expect(r.testTrades).toEqual([]);
    expect(r.splitTs).toBeNull();
  });

  it('varsayılan testFraction=1/3 ile son üçte biri test, geri kalanı train olur', () => {
    // 0..9000 arası 10 eşit aralıklı trade (aralık genişliği 1000)
    const trades = Array.from({ length: 10 }, (_, i) => trade(i * 1000));
    const r = splitTrainTest(trades);
    // range = 9000, split = 0 + 9000*(2/3) = 6000
    expect(r.splitTs).toBeCloseTo(6000, 6);
    expect(r.trainTrades.every((t) => t.timestamp < r.splitTs)).toBe(true);
    expect(r.testTrades.every((t) => t.timestamp >= r.splitTs)).toBe(true);
    expect(r.trainTrades.length + r.testTrades.length).toBe(10);
  });

  it('özel testFraction kabul eder', () => {
    const trades = Array.from({ length: 10 }, (_, i) => trade(i * 1000));
    const r = splitTrainTest(trades, 0.5);
    expect(r.splitTs).toBeCloseTo(4500, 6);
  });

  it('tüm trade\'ler aynı zaman damgasındaysa train boş, test hepsi olur (kırılmaz)', () => {
    const trades = [trade(5000), trade(5000), trade(5000)];
    const r = splitTrainTest(trades);
    expect(r.trainTrades.length + r.testTrades.length).toBe(3);
  });

  // Faz 1.4 (B9 kısmen, "combo başına değişken train/test sınırı" düzeltmesi):
  // splitTs önceden trade'lerin KENDİ min/max ts'inden türetiliyordu — farklı
  // parametre kombinasyonları farklı trade zaman aralıkları ürettiği için her
  // combo FARKLI bir test dönemi üzerinde karşılaştırılıyordu (sweep.js'te 27
  // combo, 27 ayrı takvim penceresi). Artık opsiyonel rangeStartMs/rangeEndMs
  // verilirse split SABİT takvim tarihinden hesaplanır — tüm combolar aynı
  // dönemde karşılaştırılır.
  describe('sabit takvim aralığı (Faz 1.4)', () => {
    it('rangeStartMs/rangeEndMs verilirse splitTs bunlardan hesaplanır, trade min/max\'tan DEĞİL', () => {
      // Trade'ler dar bir aralıkta (1000-2000) ama gerçek backtest dönemi 0-10000
      const trades = [trade(1000), trade(1500), trade(2000)];
      const r = splitTrainTest(trades, 1 / 3, { rangeStartMs: 0, rangeEndMs: 9000 });
      // split = 0 + 9000*(2/3) = 6000 — trade aralığından (1000-2000) türetilmiş 1666 DEĞİL
      expect(r.splitTs).toBeCloseTo(6000, 6);
    });

    it('sabit aralıkla iki farklı trade seti AYNI splitTs\'i alır (parite garantisi)', () => {
      // sweep.js senaryosu: combo A ve combo B farklı trade zaman aralıkları üretir
      // ama backtest dönemi (rangeStartMs/rangeEndMs) HER İKİSİ İÇİN de aynıdır.
      const comboA = [trade(500), trade(800)];
      const comboB = [trade(3000), trade(7000), trade(8500)];
      const range = { rangeStartMs: 0, rangeEndMs: 9000 };
      const rA = splitTrainTest(comboA, 1 / 3, range);
      const rB = splitTrainTest(comboB, 1 / 3, range);
      expect(rA.splitTs).toBe(rB.splitTs);
    });

    it('rangeStartMs/rangeEndMs verilmezse eski davranış (trade min/max) korunur — geriye uyumlu', () => {
      const trades = Array.from({ length: 10 }, (_, i) => trade(i * 1000));
      const r = splitTrainTest(trades);
      expect(r.splitTs).toBeCloseTo(6000, 6); // aynı eski test beklentisi
    });
  });
});
