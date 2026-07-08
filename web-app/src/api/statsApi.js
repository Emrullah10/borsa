const BASE = import.meta.env.VITE_SIGNAL_URL ?? 'http://localhost:3102';

export async function fetchStats(days = 7) {
  try {
    const res = await fetch(`${BASE}/stats?days=${days}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchBreakdown(by, days = 7) {
  try {
    const res = await fetch(`${BASE}/stats/breakdown?by=${by}&days=${days}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
