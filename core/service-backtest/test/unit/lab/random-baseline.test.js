import { describe, it, expect } from 'vitest';
import { randomizeDirections } from '../../../src/domain/lab/random-baseline.js';
import { mergeFundingSeries } from '../../../src/domain/lab/cost-model.js';

describe('randomizeDirections (Tip 1 yanlış-pozitif kontrolü)', () => {
  const sigs = Array.from({ length: 1000 }, (_, i) => ({ timestamp: i * 1000, direction: 'long', rate: 0.001, z: 3 }));

  it('zamanlamayı ve diğer alanları korur, yalnız yönü rastgeleler', () => {
    const r = randomizeDirections(sigs, 1);
    expect(r).toHaveLength(sigs.length);
    expect(r.map((s) => s.timestamp)).toEqual(sigs.map((s) => s.timestamp));
    expect(r[0].rate).toBe(0.001);
  });
  it('aynı seed → aynı yönler; farklı seed → farklı', () => {
    expect(randomizeDirections(sigs, 5)).toEqual(randomizeDirections(sigs, 5));
    expect(randomizeDirections(sigs, 5).map((s) => s.direction)).not.toEqual(randomizeDirections(sigs, 6).map((s) => s.direction));
  });
  it('yaklaşık dengeli (%50 ± 5)', () => {
    const longs = randomizeDirections(sigs, 9).filter((s) => s.direction === 'long').length;
    expect(longs).toBeGreaterThan(450); expect(longs).toBeLessThan(550);
  });
  it('girdiyi değiştirmez', () => {
    const copy = JSON.stringify(sigs); randomizeDirections(sigs, 1); expect(JSON.stringify(sigs)).toBe(copy);
  });
});

describe('mergeFundingSeries (PnL için: Bitget varsa o, öncesi Binance vekili)', () => {
  const bn = [{ timestamp: 1, rate: 0.1 }, { timestamp: 2, rate: 0.2 }, { timestamp: 3, rate: 0.3 }, { timestamp: 4, rate: 0.4 }];
  const bg = [{ timestamp: 3, rate: 9 }, { timestamp: 4, rate: 9 }, { timestamp: 5, rate: 9 }];
  it('Bitget başlangıcından önce Binance, sonra Bitget; çift kayıt yok', () => {
    expect(mergeFundingSeries(bg, bn)).toEqual([
      { timestamp: 1, rate: 0.1 }, { timestamp: 2, rate: 0.2 }, ...bg,
    ]);
  });
  it('Bitget boşsa Binance', () => expect(mergeFundingSeries([], bn)).toEqual(bn));
  it('Binance boşsa Bitget', () => expect(mergeFundingSeries(bg, [])).toEqual(bg));
});
