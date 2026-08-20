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
});
