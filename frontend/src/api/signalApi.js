const BASE = import.meta.env.VITE_SIGNAL_URL ?? 'http://localhost:3102';

export async function fetchSignals(limit = 20) {
  try {
    const res = await fetch(`${BASE}/signals?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.signals ?? [];
  } catch {
    return [];
  }
}

export function connectSignalWS(onSignal, onOpen) {
  const wsUrl = BASE.replace(/^http/, 'ws') + '/ws';
  const ws = new WebSocket(wsUrl);
  ws.onopen = () => onOpen?.();
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'signal') onSignal(msg.data);
    } catch {}
  };
  ws.onerror = () => {};
  return ws;
}
