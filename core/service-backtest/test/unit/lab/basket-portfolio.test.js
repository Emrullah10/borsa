import { describe, it, expect } from 'vitest';
import { runBasket, decisionDaysBetween } from '../../../src/domain/lab/basket-portfolio.js';
import { buildSeries, makeF1, makeRandom, DAY } from '../../../src/domain/lab/basket-factors.js';

const D0 = Date.UTC(2025, 0, 1);

function candles(n, g, { volume = 1000, p0 = 100 } = {}) {
  let prev = p0;
  return Array.from({ length: n }, (_, i) => {
    const close = i === 0 ? p0 : prev * (1 + g);
    const c = { timestamp: D0 + i * DAY, open: prev, high: Math.max(prev, close) * 1.005, low: Math.min(prev, close) * 0.995, close, volume };
    prev = close;
    return c;
  });
}
// 8 sembol: S0 en zayıf ... S7 en güçlü. Günlük getiri g_i = (i − 3.5) × 0.002 (sabit)
const G = (i) => (i - 3.5) * 0.002;
const world = (n = 80, extra = {}) => Array.from({ length: 8 }, (_, i) => buildSeries(`S${i}`, candles(n, G(i), extra[i] ?? {})));
const days = (from, to) => Array.from({ length: to - from }, (_, i) => D0 + (from + i) * DAY);

const BASE = {
  scoreFn: makeF1(7), k: 2, minAvgUsdVolume: 5e4, minHistoryDays: 30, costMultiplier: 0,
};

describe('runBasket — seçim ve ağırlıklar', () => {
  it('F1 ile en güçlü k sembol LONG, en zayıf k SHORT', () => {
    const res = runBasket({ ...BASE, seriesList: world(), decisionDays: days(40, 45) });
    expect(res[0].longs.sort()).toEqual(['S6', 'S7']);
    expect(res[0].shorts.sort()).toEqual(['S0', 'S1']);
  });

  it('brüt getiri = Σ w × (close/open − 1), w = ±1/(2k)', () => {
    const [d] = runBasket({ ...BASE, seriesList: world(), decisionDays: days(40, 41) });
    // 0.25×(g7+g6) − 0.25×(g0+g1) = 0.25×0.012 + 0.25×0.012
    expect(d.gross).toBeCloseTo(0.006, 8);
    expect(d.net).toBeCloseTo(0.006, 8);
  });

  it('işlem günü = karar günü + 1', () => {
    const [d] = runBasket({ ...BASE, seriesList: world(), decisionDays: days(40, 41) });
    expect(d.ts).toBe(D0 + 41 * DAY);
  });
});

describe('runBasket — maliyetler', () => {
  it('ilk gün: devir = brüt maruziyet (1.0) × taraf maliyeti; seçim aynı kalınca sonraki gün 0', () => {
    const res = runBasket({ ...BASE, costMultiplier: 1, seriesList: world(), decisionDays: days(40, 43) });
    expect(res[0].cost).toBeCloseTo(1.0 * 0.0009, 8);
    expect(res[1].cost).toBeCloseTo(0, 10);
    expect(res[1].turnover).toBeCloseTo(0, 10);
  });

  it('maliyet stresi ×2 maliyeti tam iki katına çıkarır', () => {
    const a = runBasket({ ...BASE, costMultiplier: 1, seriesList: world(), decisionDays: days(40, 41) })[0].cost;
    const b = runBasket({ ...BASE, costMultiplier: 2, seriesList: world(), decisionDays: days(40, 41) })[0].cost;
    expect(b).toBeCloseTo(2 * a, 10);
  });

  it('net = brüt − maliyet + funding', () => {
    const [d] = runBasket({ ...BASE, costMultiplier: 1, seriesList: world(), decisionDays: days(40, 41), fundingForDay: () => 0.0002 });
    expect(d.net).toBeCloseTo(d.gross - d.cost + d.funding, 12);
  });
});

describe('runBasket — funding', () => {
  it('LONG pozitif oranı öder', () => {
    const [d] = runBasket({ ...BASE, seriesList: world(), decisionDays: days(40, 41), fundingForDay: (s) => (s === 'S7' ? 0.001 : 0) });
    expect(d.funding).toBeCloseTo(-0.25 * 0.001, 10);
  });
  it('SHORT pozitif oranı ALIR', () => {
    const [d] = runBasket({ ...BASE, seriesList: world(), decisionDays: days(40, 41), fundingForDay: (s) => (s === 'S0' ? 0.001 : 0) });
    expect(d.funding).toBeCloseTo(0.25 * 0.001, 10);
  });
  it('funding bilinmiyorsa (null) 0 sayılır ve missingFunding raporlanır', () => {
    const [d] = runBasket({ ...BASE, seriesList: world(), decisionDays: days(40, 41), fundingForDay: () => null });
    expect(d.funding).toBe(0);
    expect(d.missingFunding).toBe(4);
  });
});

describe('runBasket — yeniden dengeleme', () => {
  it('rebalanceEvery=7: seçim yalnız (gün numarası % 7 === 0) günlerinde değişir', () => {
    const res = runBasket({ ...BASE, scoreFn: makeRandom(11), seriesList: world(120), decisionDays: days(40, 100), rebalanceEvery: 7, k: 2 });
    let changes = 0;
    for (let i = 1; i < res.length; i++) {
      const same = JSON.stringify([res[i].longs, res[i].shorts]) === JSON.stringify([res[i - 1].longs, res[i - 1].shorts]);
      if (!same) {
        changes++;
        const decisionDay = res[i].ts - DAY;
        expect(Math.floor(decisionDay / DAY) % 7).toBe(0);
      }
    }
    expect(changes).toBeGreaterThan(3); // test anlamlı: seçim gerçekten değişiyor
  });

  it('rebalanceEvery=1: rastgele skorda seçim her gün değişebilir', () => {
    const res = runBasket({ ...BASE, scoreFn: makeRandom(11), seriesList: world(120), decisionDays: days(40, 100), rebalanceEvery: 1, k: 2 });
    const distinct = new Set(res.map((r) => JSON.stringify([r.longs, r.shorts])));
    expect(distinct.size).toBeGreaterThan(20);
  });
});

describe('runBasket — evren filtreleri', () => {
  it('hacmi düşük sembol, en iyi momentuma sahip olsa da seçilmez', () => {
    const w = world(80, { 7: { volume: 1 } }); // S7: en güçlü ama USD hacmi ~100
    const [d] = runBasket({ ...BASE, seriesList: w, decisionDays: days(40, 41) });
    expect(d.longs).not.toContain('S7');
    expect(d.universeSize).toBe(7);
  });

  it('geçmişi yetersiz (yeni listeleme) sembol seçilmez', () => {
    const w = world(80);
    w.push(buildSeries('NEW', candles(80, 0.05).slice(50))); // gün 50'de listelendi, çok güçlü
    const [d] = runBasket({ ...BASE, seriesList: w, decisionDays: days(60, 61), minHistoryDays: 30 });
    expect(d.longs).not.toContain('NEW'); // yalnız 11 günlük geçmiş
  });

  it('evren 2k\'dan küçükse düz gün: pozisyon yok', () => {
    const [d] = runBasket({ ...BASE, k: 5, seriesList: world().slice(0, 6), decisionDays: days(40, 41) });
    expect(d.longs).toEqual([]); expect(d.shorts).toEqual([]);
    expect(d.net).toBe(0);
  });

  it('pozisyon varken evren daralıp düz güne dönerse kapatma maliyeti ödenir', () => {
    // 8 sembol → gün 40-41 pozisyon; sonra 3 sembolün verisi kesilir → evren < 2k
    const w = world(80).map((s, i) => (i >= 3 ? buildSeries(s.symbol, s.candles.slice(0, 42)) : s));
    const res = runBasket({ ...BASE, costMultiplier: 1, seriesList: w, decisionDays: days(40, 44) });
    const flat = res.find((r) => r.longs.length === 0);
    expect(flat).toBeDefined();
    expect(flat.cost).toBeGreaterThan(0);
  });
});

describe('runBasket — sızıntı testi', () => {
  it('işlem günü (u) mumlarını bozmak SEÇİMİ değiştirmez, sadece getiriyi', () => {
    const a = world();
    const b = world().map((s) => (s.symbol === 'S7'
      ? buildSeries('S7', s.candles.map((c, i) => (i === 41 ? { ...c, close: c.close * 0.5 } : c)))
      : s));
    const ra = runBasket({ ...BASE, seriesList: a, decisionDays: days(40, 41) })[0];
    const rb = runBasket({ ...BASE, seriesList: b, decisionDays: days(40, 41) })[0];
    expect(rb.longs).toEqual(ra.longs);
    expect(rb.gross).not.toBeCloseTo(ra.gross, 6);
  });
});

describe('decisionDaysBetween (işlem günü = karar günü + 24s, [başlangıç, bitiş) içinde)', () => {
  it('ilk işlem günü başlangıçtır, son işlem günü bitişten önceki gündür', () => {
    const d = decisionDaysBetween(D0 + 10 * DAY, D0 + 13 * DAY);
    expect(d.map((x) => x + DAY)).toEqual([D0 + 10 * DAY, D0 + 11 * DAY, D0 + 12 * DAY]);
  });
  it('aralık boşsa boş dizi', () => expect(decisionDaysBetween(D0 + 5 * DAY, D0 + 5 * DAY)).toEqual([]));
});
