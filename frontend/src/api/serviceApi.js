const SIGNAL_BASE = import.meta.env.VITE_SIGNAL_URL ?? 'http://localhost:3102';
const MARKET_BASE = import.meta.env.VITE_MARKET_URL ?? 'http://localhost:3101';

async function ping(url) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkServices() {
  const [signalEngine, marketData] = await Promise.all([ping(SIGNAL_BASE), ping(MARKET_BASE)]);
  return { signalEngine, marketData };
}
