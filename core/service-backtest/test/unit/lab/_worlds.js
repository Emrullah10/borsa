import { buildSeries, DAY } from '../../../src/domain/lab/basket-factors.js';
import { fundingZScores } from '../../../src/domain/lab/funding-extreme.js';
import { mulberry32 } from '../../../src/domain/lab/stats.js';

// Sentetik dünyalar (lab-pipeline.test.js ve lab-forward.test.js paylaşır).
export const START = Date.UTC(2024, 2, 1);
export const DEFAULT_END = Date.UTC(2026, 9, 6);
export const H = 3_600_000;

export const gauss = (rand) => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand());

export function tip2World({ mu = () => 0, sigma = 0.02, seed = 1, nSymbols = 30, end = DEFAULT_END }) {
  const rand = mulberry32(seed);
  const n = Math.round((end - START) / DAY);
  return Array.from({ length: nSymbols }, (_, s) => {
    let prev = 100; const candles = [];
    for (let i = 0; i < n; i++) {
      const close = prev * (1 + mu(s) + sigma * gauss(rand));
      candles.push({ timestamp: START + i * DAY, open: prev, high: Math.max(prev, close) * 1.005, low: Math.min(prev, close) * 0.995, close, volume: 2e7 / close });
      prev = close;
    }
    return buildSeries(`SYM${String(s).padStart(2, '0')}`, candles);
  });
}


export function tip1World({ planted, seed = 3, nSymbols = 12, end = DEFAULT_END }) {
  const rand = mulberry32(seed);
  return Array.from({ length: nSymbols }, (_, s) => {
    const funding = []; const drift = new Map();
    for (let t = START; t < end; t += 8 * H) {
      const spike = rand() < 1 / 40; const sign = rand() < 0.5 ? 1 : -1;
      funding.push({ timestamp: t, rate: spike ? sign * 0.0012 : 0.0001 + (rand() - 0.5) * 0.00004 });
      if (spike && planted) for (let k = 1; k <= 24; k++) drift.set(t + k * H, -sign * 0.003); // kalabalığın TERSİNE hareket
    }
    let prev = 100; const candles1h = [];
    for (let t = START; t < end; t += H) {
      const close = prev * (1 + (drift.get(t) ?? 0) + 0.004 * gauss(rand));
      candles1h.push({ timestamp: t, open: prev, high: Math.max(prev, close) * 1.003, low: Math.min(prev, close) * 0.997, close, volume: 1 });
      prev = close;
    }
    return { symbol: `T${s}USDT`, candles1h, zScores: fundingZScores(funding, { window: 90, minPeriods: 30 }), pnlSeries: funding, rank: 5 };
  });
}
