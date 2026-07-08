const BASE = import.meta.env.VITE_AI_URL ?? 'http://localhost:3110';

export async function analyzeSignal(signal) {
  try {
    const res = await fetch(`${BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signal),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.comment ?? null;
  } catch {
    return null;
  }
}
