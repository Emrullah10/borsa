const BASE = import.meta.env.VITE_SIGNAL_ENGINE_URL ?? 'http://localhost:3102';

export async function fetchRegime() {
  try {
    const res = await fetch(`${BASE}/regime`);
    if (!res.ok) return null;
    return await res.json(); // { regime, updatedAt }
  } catch {
    return null;
  }
}
