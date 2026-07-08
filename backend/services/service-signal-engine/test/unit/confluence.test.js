import { describe, it, expect } from 'vitest';
import { calcConfluence, adaptiveThreshold } from '../../src/confluence.js';

// ADX >= 25 ile güçlü trend fixture'ları
const strongLong = {
  ema9: 110, ema21: 108, ema50: 105,
  rsi: 58,
  macd: { macd: 0.5, signal: 0.3, histogram: 0.2 },
  bb: { upper: 115, middle: 110, lower: 105 },
  atr: 2.0, vwap: 109, currentPrice: 111,
  adx: 30, volumeRatio: 1.8, supportLevel: 108, resistanceLevel: 118,
};

const strongShort = {
  ema9: 98, ema21: 101, ema50: 105,
  rsi: 38,
  macd: { macd: -0.5, signal: -0.3, histogram: -0.2 },
  bb: { upper: 105, middle: 101, lower: 97 },
  atr: 2.0, vwap: 100, currentPrice: 99,
  adx: 28, volumeRatio: 2.0, supportLevel: 95, resistanceLevel: 102,
};

describe('calcConfluence', () => {
  it('strong long signals return long direction with high score', () => {
    const result = calcConfluence(strongLong, { score: 0.7, direction: 'long' }, 0.55);
    expect(result.direction).toBe('long');
    expect(result.score).toBeGreaterThan(0.55);
    expect(result.isCandidate).toBe(true);
  });

  it('strong short signals return short direction', () => {
    const result = calcConfluence(strongShort, { score: 0.65, direction: 'short' }, 0.55);
    expect(result.direction).toBe('short');
    expect(result.isCandidate).toBe(true);
  });

  it('weak signals return isCandidate=false', () => {
    const weak = { ...strongLong, rsi: 50, macd: null };
    const result = calcConfluence(weak, { score: 0.4, direction: 'neutral' }, 0.65);
    expect(result.isCandidate).toBe(false);
  });

  it('score is always 0..1', () => {
    const result = calcConfluence(strongLong, { score: 0.8, direction: 'long' }, 0.55);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('ADX < 25 (choppy market) — gate kaldırıldı, hâlâ sinyal üretebilir', () => {
    // ADX hard gate kaldırıldı; düşük ADX artık otomatik red değil
    const choppy = { ...strongLong, adx: 15 };
    const result = calcConfluence(choppy, { score: 0.9, direction: 'long' }, 0.55);
    // Güçlü trend + momentum indicator'ları varsa candidate olabilir
    expect(result.isCandidate).toBe(true);
  });

  it('ADX = null — gate kaldırıldı, diğer göstergeler yeterliyse candidate', () => {
    const noAdx = { ...strongLong, adx: null };
    const result = calcConfluence(noAdx, { score: 0.7, direction: 'long' }, 0.55);
    expect(result.isCandidate).toBe(true);
  });

  it('yüksek volume (>=1.5x) momentum skoru artırır', () => {
    const highVol  = { ...strongLong, volumeRatio: 2.0 };
    const normalVol = { ...strongLong, volumeRatio: 1.0 };
    const r1 = calcConfluence(highVol,   { score: 0.7, direction: 'long' }, 0.55);
    const r2 = calcConfluence(normalVol, { score: 0.7, direction: 'long' }, 0.55);
    expect(r1.score).toBeGreaterThanOrEqual(r2.score);
  });

  it('breakdown içinde adxValue ve volumeRatio alanları var', () => {
    const result = calcConfluence(strongLong, { score: 0.7, direction: 'long' }, 0.55);
    expect(result.breakdown).toHaveProperty('adxValue');
    expect(result.breakdown).toHaveProperty('volumeRatio');
    expect(result.breakdown).toHaveProperty('nearSupport');
    expect(result.breakdown).toHaveProperty('nearResistance');
    expect(result.breakdown).toHaveProperty('effectiveThreshold');
    expect(result.breakdown).toHaveProperty('higherTfTrend');
    expect(result.breakdown).toHaveProperty('tfMismatch');
  });

  it('higherTfTrend=long + direction=long → isCandidate=true', () => {
    const result = calcConfluence(strongLong, { score: 0.7, direction: 'long' }, 0.55, 'long');
    expect(result.isCandidate).toBe(true);
    expect(result.breakdown.tfMismatch).toBe(false);
  });

  it('higherTfTrend=short + direction=long → isCandidate=false (TF uyumsuzluğu)', () => {
    const result = calcConfluence(strongLong, { score: 0.7, direction: 'long' }, 0.55, 'short');
    expect(result.isCandidate).toBe(false);
    expect(result.breakdown.tfMismatch).toBe(true);
  });

  it('higherTfTrend=null → TF gate atlanır, normal davranış', () => {
    const result = calcConfluence(strongLong, { score: 0.7, direction: 'long' }, 0.55, null);
    expect(result.isCandidate).toBe(true);
    expect(result.breakdown.tfMismatch).toBe(false);
  });

  it('regime=bull + direction=long → counter-trend YOK, eşik normal', () => {
    const r = calcConfluence(strongLong, { score: 0.7, direction: 'long' }, 0.55, null, 'bull');
    expect(r.breakdown.counterTrend).toBe(false);
    expect(r.breakdown.regime).toBe('bull');
  });

  it('regime=bull + direction=short → counter-trend, effectiveThreshold +0.12', () => {
    const r = calcConfluence(strongShort, { score: 0.65, direction: 'short' }, 0.55, null, 'bull');
    expect(r.breakdown.counterTrend).toBe(true);
    expect(r.breakdown.effectiveThreshold).toBeGreaterThan(0.55);
  });

  it('regime=bear + direction=long → counter-trend', () => {
    const r = calcConfluence(strongLong, { score: 0.7, direction: 'long' }, 0.55, null, 'bear');
    expect(r.breakdown.counterTrend).toBe(true);
  });

  it('regime=neutral → counter-trend yok (iki yön serbest)', () => {
    const r = calcConfluence(strongShort, { score: 0.65, direction: 'short' }, 0.55, null, 'neutral');
    expect(r.breakdown.counterTrend).toBe(false);
  });
});

describe('adaptiveThreshold', () => {
  it('yüksek vol (atr% > 1.5%) → eşik artar', () => {
    expect(adaptiveThreshold(0.65, 0.02)).toBeCloseTo(0.70);
  });

  it('düşük vol (atr% < 0.5%) → eşik azalır', () => {
    expect(adaptiveThreshold(0.65, 0.003)).toBeCloseTo(0.60);
  });

  it('orta vol → eşik değişmez', () => {
    expect(adaptiveThreshold(0.65, 0.01)).toBeCloseTo(0.65);
  });

  it('sonuç 0.50–0.85 arasında kalır (clamp)', () => {
    expect(adaptiveThreshold(0.85, 0.001)).toBeLessThanOrEqual(0.85);
    expect(adaptiveThreshold(0.50, 0.05)).toBeGreaterThanOrEqual(0.50);
  });

  it('atrPercent=null → baseThreshold döner', () => {
    expect(adaptiveThreshold(0.65, null)).toBeCloseTo(0.65);
  });
});
