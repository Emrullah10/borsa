const BASE = import.meta.env.VITE_CARRY_URL ?? 'http://localhost:3104';

async function getJson(path) {
  try {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const fetchCarrySummary = () => getJson('/carry/summary');
export const fetchCarryOpportunities = () => getJson('/carry/opportunities');
export const fetchCarryRiskEvents = () => getJson('/carry/risk-events');
export const fetchCarryEquity = () => getJson('/carry/equity');
