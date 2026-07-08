const BASE = import.meta.env.VITE_SIGNAL_URL ?? 'http://localhost:3102';

export async function fetchStats() {
  try {
    const res = await fetch(`${BASE}/stats`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
