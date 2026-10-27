import { describe, it, expect } from 'vitest';
import { runCarryBacktest, summarizeDaily, DAY_MS } from '../../src/domain/backtest-carry.js';
import { CARRY_RULES, modeledSideCost } from '../../src/domain/carry-config.js';
import { UTILIZATION } from '../../src/domain/paper-book.js';

const D0 = Date.UTC(2026, 0, 1);
const days = (n, f) => new Map(Array.from({ length: n }, (_, k) => [D0 + k * DAY_MS, f(k)]));
const rules = { ...CARRY_RULES, slots: 1, lookbackDays: 3 };
const universe = new Map([['A', { spotVolume: 1e8 }], ['B', { spotVolume: 1e8 }]]);

describe('runCarryBacktest', () => {
  it('sürekli yüksek funding: pencere dolunca açar, günlük funding\'i alır, bir kez maliyet öder', () => {
    const daily = 0.001; // günlük %0.1 → yıllık %36.5
    const buckets = new Map([['A', days(10, () => daily)]]);
    const r = runCarryBacktest({ buckets, universe, from: D0, to: D0 + 10 * DAY_MS, rules });
    const w = UTILIZATION / rules.slots;
    expect(r.daily.slice(0, 3).every((x) => x.held === 0)).toBe(true); // pencere dolmadan işlem yok
    expect(r.trades).toBe(1);
    expect(r.daily[3].ret).toBeCloseTo(daily * w - modeledSideCost(1e8) * w, 12);
    expect(r.daily[4].ret).toBeCloseTo(daily * w, 12);
  });

  it('look-ahead yok: tek günlük funding sıçraması YAKALANAMAZ', () => {
    // A her gün sıfır, yalnız 6. gün dev funding. Strateji o güne girmek için ileriyi görmeli.
    const buckets = new Map([['A', days(10, (k) => (k === 6 ? 0.5 : 0))]]);
    const r = runCarryBacktest({ buckets, universe, from: D0, to: D0 + 10 * DAY_MS, rules });
    expect(r.daily[6].held).toBe(0);
    expect(r.daily.reduce((a, b) => a + b.ret, 0)).toBeLessThanOrEqual(0);
  });

  it('funding sönünce çıkış eşiğinde kapatır', () => {
    const buckets = new Map([['A', days(12, (k) => (k < 5 ? 0.001 : 0))]]);
    const r = runCarryBacktest({ buckets, universe, from: D0, to: D0 + 12 * DAY_MS, rules });
    expect(r.trades).toBe(2);
    expect(r.daily.at(-1).held).toBe(0);
  });

  it('maliyet çarpanı ×2 sonucu kötüleştirir', () => {
    const buckets = new Map([['A', days(30, () => 0.001)], ['B', days(30, (k) => (k % 6 < 3 ? 0.002 : 0))]]);
    const base = summarizeDaily(runCarryBacktest({ buckets, universe, from: D0, to: D0 + 30 * DAY_MS, rules }).daily);
    const x2 = summarizeDaily(runCarryBacktest({ buckets, universe, from: D0, to: D0 + 30 * DAY_MS, rules, costMultiplier: 2 }).daily);
    expect(x2.apr).toBeLessThan(base.apr);
  });
});

describe('summarizeDaily', () => {
  it('APR, düşüş, pozitif ay sayısı', () => {
    const daily = [{ day: D0, ret: 0.001 }, { day: D0 + DAY_MS, ret: -0.002 }, { day: D0 + 2 * DAY_MS, ret: 0.001 }];
    const s = summarizeDaily(daily);
    expect(s.apr).toBeCloseTo(0, 12);
    expect(s.maxDrawdown).toBeCloseTo(-0.002, 12);
    expect(s.negativeDayShare).toBeCloseTo(1 / 3, 12);
    expect(s.totalMonths).toBe(1);
  });
});
