// Varsayılan: aynı origin, vite server/preview '/carry'yi service-carry'ye (:3104) proxy'ler.
const BASE = import.meta.env.VITE_CARRY_URL ?? '';

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
