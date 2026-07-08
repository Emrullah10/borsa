import { describe, it, expect } from 'vitest';
import { calcRegime, calcTfTrend } from '../../src/domain/regime.js';

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
