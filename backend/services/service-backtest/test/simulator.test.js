import { describe, it, expect } from 'vitest';
import { simulateTrade } from '../src/simulator.js';

function candle(high, low, close = (high + low) / 2) {
  return { timestamp: Date.now(), open: close, high, low, close, volume: 100 };
}

describe('simulateTrade — LONG', () => {
  const setup = {
    entryPrice: 100,
    stopPrice: 95,
    targetPrice: 110,
    direction: 'long',
  };

  it('target fiyata ulaşınca WIN döner', () => {
    const candles = [
      candle(105, 99),
      candle(111, 100),
    ];
    const result = simulateTrade(setup, candles);
    expect(result.outcome).toBe('WIN');
    expect(result.r).toBeCloseTo(2.0, 1);
    expect(result.durationMinutes).toBe(2);
  });

  it('stop fiyatına ulaşınca LOSS döner', () => {
    const candles = [
      candle(101, 94),
    ];
    const result = simulateTrade(setup, candles);
    expect(result.outcome).toBe('LOSS');
    expect(result.r).toBeCloseTo(-1.0, 1);
    expect(result.durationMinutes).toBe(1);
  });

  it('240 mum sonunda ne TP ne SL → TIMEOUT döner', () => {
    const candles = Array(240).fill(candle(102, 98));
    const result = simulateTrade(setup, candles);
    expect(result.outcome).toBe('TIMEOUT');
    expect(result.durationMinutes).toBe(240);
  });
});

describe('simulateTrade — SHORT', () => {
  const setup = {
    entryPrice: 100,
    stopPrice: 105,
    targetPrice: 90,
    direction: 'short',
  };

  it('target fiyata ulaşınca WIN döner', () => {
    const candles = [
      candle(101, 89),
    ];
    const result = simulateTrade(setup, candles);
    expect(result.outcome).toBe('WIN');
    expect(result.r).toBeCloseTo(2.0, 1);
  });

  it('stop fiyatına ulaşınca LOSS döner', () => {
    const candles = [
      candle(106, 98),
    ];
    const result = simulateTrade(setup, candles);
    expect(result.outcome).toBe('LOSS');
    expect(result.r).toBeCloseTo(-1.0, 1);
  });
});
