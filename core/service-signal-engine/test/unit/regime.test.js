import { describe, it, expect } from 'vitest';
import { calcRegime, calcTfTrend, calcHigherTfTrend } from '../../src/domain/regime.js';

function makeCandles(closes) {
  return closes.map(c => ({ open: c, high: c + 1, low: c - 1, close: c, volume: 1000 }));
}

const rising  = makeCandles(Array.from({ length: 60 }, (_, i) => 100 + i * 2));
const falling = makeCandles(Array.from({ length: 60 }, (_, i) => 220 - i * 2));

describe('calcTfTrend (tek timeframe)', () => {
  it('yetersiz veri → neutral', () => {
    expect(calcTfTrend(makeCandles([100, 101, 102]))).toBe('neutral');
  });

  it('yükselen güçlü trend → bull', () => {
    expect(calcTfTrend(rising)).toBe('bull');
  });

  it('düşen güçlü trend → bear', () => {
    expect(calcTfTrend(falling)).toBe('bear');
  });

  it('null/boş giriş → neutral', () => {
    expect(calcTfTrend(null)).toBe('neutral');
    expect(calcTfTrend([])).toBe('neutral');
  });
});

describe('calcRegime (sadece 4h)', () => {
  it('4h yükselen → bull', () => {
    expect(calcRegime(rising)).toBe('bull');
  });

  it('4h düşen → bear', () => {
    expect(calcRegime(falling)).toBe('bear');
  });

  it('4h verisi yok/yetersiz → neutral', () => {
    expect(calcRegime(null)).toBe('neutral');
    expect(calcRegime([])).toBe('neutral');
    expect(calcRegime(makeCandles([100, 101, 102]))).toBe('neutral');
  });
});

describe('calcHigherTfTrend (EMA9 vs EMA21)', () => {
  const risingCloses = Array.from({ length: 40 }, (_, i) => 100 + i * 2);
  const fallingCloses = Array.from({ length: 40 }, (_, i) => 200 - i * 2);
  const flatCloses = Array.from({ length: 40 }, () => 100);

  it('yükselen kapanışlar → long', () => {
    expect(calcHigherTfTrend(risingCloses)).toBe('long');
  });

  it('düşen kapanışlar → short', () => {
    expect(calcHigherTfTrend(fallingCloses)).toBe('short');
  });

  it('düz kapanışlar → neutral', () => {
    expect(calcHigherTfTrend(flatCloses)).toBe('neutral');
  });

  it('30 mumdan az veri → null', () => {
    expect(calcHigherTfTrend(risingCloses.slice(0, 29))).toBeNull();
  });

  it('null/boş giriş → null', () => {
    expect(calcHigherTfTrend(null)).toBeNull();
    expect(calcHigherTfTrend([])).toBeNull();
  });
});
