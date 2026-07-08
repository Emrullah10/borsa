import { describe, it, expect } from 'vitest';
import { calcLiquidationPressure } from '../../src/domain/liquidation-pressure.js';

describe('calcLiquidationPressure', () => {
  it('neutral conditions return score near 0.5', () => {
    const result = calcLiquidationPressure({
      fundingRate: 0.0001, oiDelta: 0, longRatio: 0.5, shortRatio: 0.5, priceChange: 0,
    });
    expect(result.score).toBeGreaterThan(0.35);
    expect(result.score).toBeLessThan(0.65);
  });

  it('extreme positive funding + excess longs → direction=short (long squeeze risk)', () => {
    const result = calcLiquidationPressure({
      fundingRate: 0.003, oiDelta: 5000, longRatio: 0.75, shortRatio: 0.25, priceChange: 0.02,
    });
    expect(result.direction).toBe('short');
    expect(result.score).toBeGreaterThan(0.6);
  });

  it('negative funding + excess shorts → direction=long (short squeeze risk)', () => {
    const result = calcLiquidationPressure({
      fundingRate: -0.002, oiDelta: 4000, longRatio: 0.25, shortRatio: 0.75, priceChange: -0.02,
    });
    expect(result.direction).toBe('long');
    expect(result.score).toBeGreaterThan(0.6);
  });

  it('score is always between 0 and 1', () => {
    const result = calcLiquidationPressure({
      fundingRate: 0.01, oiDelta: 100000, longRatio: 0.9, shortRatio: 0.1, priceChange: 0.05,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('funding > 0.005 (very extreme) → direction=short, fundingContrarian=true', () => {
    const result = calcLiquidationPressure({
      fundingRate: 0.008, oiDelta: 0, longRatio: 0.5, shortRatio: 0.5, priceChange: 0,
    });
    expect(result.direction).toBe('short');
    expect(result.components.fundingContrarian).toBe(true);
  });

  it('funding < -0.005 (very extreme negative) → direction=long, fundingContrarian=true', () => {
    const result = calcLiquidationPressure({
      fundingRate: -0.008, oiDelta: 0, longRatio: 0.5, shortRatio: 0.5, priceChange: 0,
    });
    expect(result.direction).toBe('long');
    expect(result.components.fundingContrarian).toBe(true);
  });

  it('funding contrarian does NOT override direction already set by squeeze logic', () => {
    // longSqueezeSignals triggered first → direction='short'; contrarian must not double-set
    const result = calcLiquidationPressure({
      fundingRate: 0.006, oiDelta: 5000, longRatio: 0.75, shortRatio: 0.25, priceChange: 0.02,
    });
    expect(result.direction).toBe('short');
    // fundingContrarian should be false since squeeze logic already set direction
    expect(result.components.fundingContrarian).toBe(false);
  });
});
