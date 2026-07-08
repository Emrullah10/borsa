import { describe, it, expect } from 'vitest';
import { buildSignalChartOption } from './SignalChart.jsx';

const candles = Array.from({ length: 10 }, (_, i) => ({
  ts: 1000 + i * 60000,
  open: 100 + i, high: 105 + i, low: 99 + i, close: 103 + i, volume: 50,
}));
const signal = { direction: 'long', entryPrice: 103, stopPrice: 100, targetPrice: 107 };

describe('buildSignalChartOption', () => {
  it('candlestick serisi içerir', () => {
    const opt = buildSignalChartOption(candles, signal);
    expect(opt.series.map((s) => s.type)).toContain('candlestick');
  });

  it('3 markLine var (entry/stop/hedef)', () => {
    const opt = buildSignalChartOption(candles, signal);
    const cdl = opt.series.find((s) => s.type === 'candlestick');
    expect(cdl.markLine.data).toHaveLength(3);
  });

  it('xAxis veri sayısı mum sayısına eşit', () => {
    const opt = buildSignalChartOption(candles, signal);
    expect(opt.xAxis[0].data.length).toBe(candles.length);
  });
});
