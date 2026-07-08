const BASE = import.meta.env.VITE_MARKET_URL ?? 'http://localhost:3101';

export async function fetchCandles(symbol, tf = '1m', limit = 60) {
  try {
    const res = await fetch(`${BASE}/candles/${symbol}?timeframe=${tf}&limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.candles ?? [];
  } catch {
    return [];
  }
}

export async function fetchPrice(symbol) {
  try {
    const res = await fetch(`${BASE}/price/${symbol}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.price ?? null;
  } catch {
    return null;
  }
}
