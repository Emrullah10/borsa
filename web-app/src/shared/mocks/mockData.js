const SYMBOLS = ['BTCUSDT', 'ETHUSDT'];
const BASE = { BTCUSDT: 78000, ETHUSDT: 3100 };

function gen(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export const mockSignals = Array.from({ length: 60 }, (_, i) => {
  const symbol = SYMBOLS[i % 2];
  const direction = gen(i) > 0.5 ? 'long' : 'short';
  const entry = BASE[symbol] * (1 + (gen(i + 100) - 0.5) * 0.01);
  const dist = entry * 0.0008;
  const stop = direction === 'long' ? entry - dist : entry + dist;
  const target = direction === 'long' ? entry + dist * 1.5 : entry - dist * 1.5;
  return {
    id: `sig-${i}`,
    symbol,
    direction,
    entryPrice: parseFloat(entry.toFixed(2)),
    stopPrice: parseFloat(stop.toFixed(2)),
    targetPrice: parseFloat(target.toFixed(2)),
    rrRatio: 1.5,
    confluenceScore: parseFloat((0.65 + gen(i + 7) * 0.3).toFixed(3)),
    createdAt: new Date(Date.now() - i * 5 * 60 * 1000).toISOString(),
    status: i < 6 ? 'open' : 'closed',
  };
});

export const mockCandles = Array.from({ length: 120 }, (_, i) => {
  const base = BASE.BTCUSDT;
  const open = base * (1 + (gen(i) - 0.5) * 0.004);
  const close = open * (1 + (gen(i + 50) - 0.5) * 0.003);
  const high = Math.max(open, close) * (1 + gen(i + 9) * 0.001);
  const low = Math.min(open, close) * (1 - gen(i + 3) * 0.001);
  return {
    timestamp: Date.now() - (120 - i) * 60 * 1000,
    open: parseFloat(open.toFixed(2)),
    high: parseFloat(high.toFixed(2)),
    low: parseFloat(low.toFixed(2)),
    close: parseFloat(close.toFixed(2)),
    volume: parseFloat((gen(i + 11) * 500).toFixed(2)),
  };
});

export const mockServiceStatus = {
  marketData: { up: true, port: 3101 },
  signalEngine: { up: true, port: 3102 },
  livePrice: { BTCUSDT: BASE.BTCUSDT, ETHUSDT: BASE.ETHUSDT },
};
