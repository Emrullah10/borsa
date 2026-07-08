import { describe, it, expect, vi } from 'vitest';
import { calcMetrics, formatTable } from '../src/reporter.js';

const sampleTrades = [
  { outcome: 'WIN',     r: 2.0,  durationMinutes: 30, symbol: 'BTCUSDT', direction: 'long' },
  { outcome: 'LOSS',    r: -1.0, durationMinutes: 15, symbol: 'BTCUSDT', direction: 'long' },
  { outcome: 'WIN',     r: 1.8,  durationMinutes: 45, symbol: 'BTCUSDT', direction: 'short' },
  { outcome: 'TIMEOUT', r: 0,    durationMinutes: 240, symbol: 'BTCUSDT', direction: 'long' },
  { outcome: 'LOSS',    r: -1.0, durationMinutes: 10, symbol: 'BTCUSDT', direction: 'short' },
];

describe('calcMetrics', () => {
  it('win rate, profit factor, max drawdown ve avgR hesaplar', () => {
    const m = calcMetrics(sampleTrades);
    expect(m.winRate).toBeCloseTo(0.5, 2);
    expect(m.profitFactor).toBeCloseTo(1.9, 2);
    expect(typeof m.maxDrawdown).toBe('number');
    expect(m.avgR).toBeCloseTo(0.36, 2);
    expect(m.totalSignals).toBe(5);
    expect(m.timeouts).toBe(1);
  });

  it('sinyal yoksa sıfır döner', () => {
    const m = calcMetrics([]);
    expect(m.winRate).toBe(0);
    expect(m.profitFactor).toBe(0);
    expect(m.maxDrawdown).toBe(0);
    expect(m.avgR).toBe(0);
  });
});

describe('formatTable', () => {
  it('string çıktı üretir ve başlık satırı içerir', () => {
    const bySymbol = {
      BTCUSDT: { ...calcMetrics(sampleTrades), trades: sampleTrades },
    };
    const total = calcMetrics(sampleTrades);
    const output = formatTable(bySymbol, total);
    expect(typeof output).toBe('string');
    expect(output).toContain('BTCUSDT');
    expect(output).toContain('Win%');
  });
});
