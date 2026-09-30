import { describe, it, expect } from 'vitest';
import { buildSeries, makeF1, makeF2, makeF3, makeRandom, DAY } from '../../../src/domain/lab/basket-factors.js';

const D0 = Date.UTC(2025, 0, 1);
// Günlük mum üretici: close dizisinden. open = önceki close (7/24 piyasa), high/low ±%1.
function candlesFrom(closes, { volume = 1000, rangePct = 0.02, start = D0 } = {}) {
  return closes.map((c, i) => ({
    timestamp: start + i * DAY, open: i === 0 ? c : closes[i - 1],
    high: c * (1 + rangePct / 2), low: c * (1 - rangePct / 2), close: c, volume,
  }));
}
const grow = (n, g, p0 = 100) => Array.from({ length: n }, (_, i) => p0 * Math.pow(1 + g, i));
const member = (symbol, candles, day) => {
  const series = buildSeries(symbol, candles);
  return { symbol, series, idx: series.byDay.get(day) };
};

describe('buildSeries', () => {
  it('gün → indeks haritası', () => {
    const s = buildSeries('X', candlesFrom(grow(5, 0.01)));
    expect(s.byDay.get(D0 + 3 * DAY)).toBe(3);
    expect(s.byDay.get(D0 + 9 * DAY)).toBeUndefined();
  });
});

describe('F1 momentum: L günlük getiri', () => {
  it('skor = close_d / close_{d-L} − 1', () => {
    const day = D0 + 39 * DAY;
    const m = member('UP', candlesFrom(grow(40, 0.01)), day);
    const score = makeF1(14)([m], day).get('UP');
    expect(score).toBeCloseTo(Math.pow(1.01, 14) - 1, 8);
  });

  it('daha hızlı büyüyen daha yüksek skor alır', () => {
    const day = D0 + 39 * DAY;
    const sc = makeF1(14)([member('A', candlesFrom(grow(40, 0.02)), day), member('B', candlesFrom(grow(40, -0.01)), day)], day);
    expect(sc.get('A')).toBeGreaterThan(sc.get('B'));
  });

  it('geri bakış gününde boşluk (eksik mum) varsa o sembol skorlanmaz', () => {
    const day = D0 + 39 * DAY;
    const gap = candlesFrom(grow(40, 0.01)).filter((x) => x.timestamp !== day - 14 * DAY);
    const sc = makeF1(14)([member('GAP', gap, day)], day);
    expect(sc.has('GAP')).toBe(false);
  });

  it('SIZINTI: d sonrası mumlar skoru değiştirmez', () => {
    const day = D0 + 29 * DAY;
    const closes = grow(40, 0.01);
    const a = makeF1(14)([member('X', candlesFrom(closes), day)], day).get('X');
    const changed = closes.map((c, i) => (i > 29 ? c * 5 : c));
    const b = makeF1(14)([member('X', candlesFrom(changed), day)], day).get('X');
    expect(b).toBe(a);
  });
});

describe('F2 dönüş: önceki günün getirisinin tersi', () => {
  it('dün en çok DÜŞEN en yüksek skoru alır (long adayı)', () => {
    const day = D0 + 39 * DAY;
    const up = grow(40, 0.0); up[39] = up[38] * 1.10;      // dün +%10
    const dn = grow(40, 0.0); dn[39] = dn[38] * 0.90;      // dün −%10
    const sc = makeF2()([member('UP', candlesFrom(up), day), member('DN', candlesFrom(dn), day)], day);
    expect(sc.get('DN')).toBeGreaterThan(sc.get('UP'));
    expect(sc.get('DN')).toBeCloseTo(0.10, 8);
  });
});

describe('F3 (makale benzeri): düşük hacim + geniş aralık + pozitif trend', () => {
  const day = D0 + 39 * DAY;
  const mk = (sym, { volume, rangePct, g }) => member(sym, candlesFrom(grow(40, g), { volume, rangePct }), day);

  it('düşük hacimli, geniş aralıklı, yükselen sembol en yüksek; tersi en düşük', () => {
    const members = [
      mk('BEST', { volume: 100, rangePct: 0.10, g: 0.01 }),
      mk('MID', { volume: 1000, rangePct: 0.05, g: 0.0 }),
      mk('WORST', { volume: 10000, rangePct: 0.01, g: -0.01 }),
    ];
    const sc = makeF3()(members, day);
    expect(sc.get('BEST')).toBeGreaterThan(sc.get('MID'));
    expect(sc.get('MID')).toBeGreaterThan(sc.get('WORST'));
  });

  it('beraberlikte sembol adına göre deterministik', () => {
    const mkSame = (s) => member(s, candlesFrom(grow(40, 0.0), { volume: 500, rangePct: 0.02 }), day);
    const a = makeF3()([mkSame('AAA'), mkSame('BBB')], day);
    const b = makeF3()([mkSame('BBB'), mkSame('AAA')], day);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });
});

describe('makeRandom (yanlış-pozitif kontrolü için seed\'li rastgele skor)', () => {
  const day = D0 + 39 * DAY;
  const ms = ['A', 'B', 'C', 'D'].map((s) => member(s, candlesFrom(grow(40, 0.01)), day));
  it('aynı seed+gün+sembol → aynı skor', () => {
    expect(makeRandom(7)(ms, day)).toEqual(makeRandom(7)(ms, day));
  });
  it('farklı seed → farklı skorlar', () => {
    expect([...makeRandom(1)(ms, day).values()]).not.toEqual([...makeRandom(2)(ms, day).values()]);
  });
  it('sıra bağımsız: üye listesi karışınca sembol skoru değişmez', () => {
    const a = makeRandom(3)(ms, day).get('B');
    const b = makeRandom(3)([...ms].reverse(), day).get('B');
    expect(a).toBe(b);
  });
});
