import { describe, it, expect } from 'vitest';
import { calcEMA, calcRSI, calcBollingerBands, calcATR, calcMACD, calcVWAP, calcAllIndicators,
         calcADX, calcSupportResistance, calcVolumeSMA } from '../../src/indicators.js';

const closes20 = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109,
                  110, 112, 111, 113, 115, 114, 116, 118, 117, 119];
const highs20  = closes20.map(c => c + 1);
const lows20   = closes20.map(c => c - 1);
const volumes20 = closes20.map(() => 1000);

describe('calcEMA', () => {
  it('returns result array and last value is in range', () => {
    const result = calcEMA(closes20, 9);
    expect(result.length).toBeGreaterThan(0);
    const last = result[result.length - 1];
    expect(last).toBeGreaterThan(100);
    expect(last).toBeLessThan(125);
  });

  it('returns empty array when insufficient data', () => {
    expect(calcEMA([100, 101], 9)).toEqual([]);
  });
});

describe('calcRSI', () => {
  it('RSI is between 0 and 100', () => {
    const result = calcRSI(closes20, 14);
    expect(result.length).toBeGreaterThan(0);
    const last = result[result.length - 1];
    expect(last).toBeGreaterThanOrEqual(0);
    expect(last).toBeLessThanOrEqual(100);
  });

  it('rising series produces high RSI (>60)', () => {
    const rising = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
    const result = calcRSI(rising, 14);
    expect(result[result.length - 1]).toBeGreaterThan(60);
  });
});

describe('calcBollingerBands', () => {
  it('returns upper > middle > lower', () => {
    const result = calcBollingerBands(closes20, 20, 2);
    expect(result).not.toBeNull();
    expect(result.upper).toBeGreaterThan(result.middle);
    expect(result.middle).toBeGreaterThan(result.lower);
  });
});

describe('calcATR', () => {
  it('ATR is a positive number', () => {
    const result = calcATR(highs20, lows20, closes20, 14);
    expect(result).toBeGreaterThan(0);
  });
});

describe('calcMACD', () => {
  it('returns object with macd, signal, histogram', () => {
    const closes30 = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5 + i);
    const result = calcMACD(closes30);
    expect(result).not.toBeNull();
    expect(typeof result.macd).toBe('number');
    expect(typeof result.signal).toBe('number');
    expect(typeof result.histogram).toBe('number');
  });
});

describe('calcVWAP', () => {
  it('VWAP is in range of input prices', () => {
    const result = calcVWAP(highs20, lows20, closes20, volumes20);
    expect(result).toBeGreaterThan(99);
    expect(result).toBeLessThan(125);
  });
});

describe('calcAllIndicators', () => {
  it('returns object with ema9, ema21, ema50, rsi, macd, bb, atr, vwap', () => {
    const candles = closes20.map((c, i) => ({
      open: c - 0.5, high: highs20[i], low: lows20[i], close: c, volume: volumes20[i]
    }));
    const result = calcAllIndicators(candles);
    expect(result).toHaveProperty('ema9');
    expect(result).toHaveProperty('ema21');
    expect(result).toHaveProperty('rsi');
    expect(result).toHaveProperty('atr');
    expect(result).toHaveProperty('vwap');
    expect(result).toHaveProperty('adx');
    expect(result).toHaveProperty('supportLevel');
    expect(result).toHaveProperty('resistanceLevel');
    expect(result).toHaveProperty('volumeRatio');
  });

  it('volumeRatio equals currentVolume/SMA when uniform volume', () => {
    const candles = closes20.map((c, i) => ({
      open: c - 0.5, high: highs20[i], low: lows20[i], close: c, volume: volumes20[i]
    }));
    const result = calcAllIndicators(candles);
    expect(result.volumeRatio).toBeCloseTo(1, 2);
  });
});

describe('calcADX', () => {
  it('returns null when insufficient data', () => {
    expect(calcADX(highs20, lows20, closes20, 14)).toBeNull();
  });

  it('returns a number in strong trend (long rising series)', () => {
    const n = 60;
    const closes = Array.from({ length: n }, (_, i) => 100 + i * 2);
    const highs  = closes.map(c => c + 1);
    const lows   = closes.map(c => c - 1);
    const result = calcADX(highs, lows, closes, 14);
    expect(result).not.toBeNull();
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
  });

  it('ADX > 25 in strongly trending market', () => {
    const n = 60;
    const closes = Array.from({ length: n }, (_, i) => 100 + i * 3);
    const highs  = closes.map(c => c + 2);
    const lows   = closes.map(c => c - 2);
    const result = calcADX(highs, lows, closes, 14);
    expect(result).toBeGreaterThan(25);
  });
});

describe('calcSupportResistance', () => {
  it('returns supportLevels and resistanceLevels arrays', () => {
    const candles = closes20.map((c, i) => ({
      open: c - 0.5, high: highs20[i], low: lows20[i], close: c, volume: volumes20[i]
    }));
    const result = calcSupportResistance(candles);
    expect(result).toHaveProperty('supportLevels');
    expect(result).toHaveProperty('resistanceLevels');
    expect(Array.isArray(result.supportLevels)).toBe(true);
    expect(Array.isArray(result.resistanceLevels)).toBe(true);
  });

  it('support levels are below resistance levels for trending data', () => {
    const candles = closes20.map((c, i) => ({
      open: c - 0.5, high: highs20[i], low: lows20[i], close: c, volume: volumes20[i]
    }));
    const { supportLevels, resistanceLevels } = calcSupportResistance(candles);
    if (supportLevels.length && resistanceLevels.length) {
      expect(Math.max(...supportLevels)).toBeLessThan(Math.max(...resistanceLevels));
    }
  });
});

describe('calcVolumeSMA', () => {
  it('returns null for insufficient data', () => {
    expect(calcVolumeSMA([1000, 2000], 20)).toBeNull();
  });

  it('returns correct average', () => {
    const vols = Array.from({ length: 20 }, () => 500);
    expect(calcVolumeSMA(vols, 20)).toBeCloseTo(500);
  });

  it('uses last N values only', () => {
    const vols = [...Array.from({ length: 10 }, () => 100), ...Array.from({ length: 20 }, () => 1000)];
    expect(calcVolumeSMA(vols, 20)).toBeCloseTo(1000);
  });
});
