const MAX_CANDLES = 240;

export function simulateTrade(setup, candles) {
  const { entryPrice, stopPrice, targetPrice, direction } = setup;
  const risk = Math.abs(entryPrice - stopPrice);

  const window = candles.slice(0, MAX_CANDLES);

  for (let i = 0; i < window.length; i++) {
    const { high, low } = window[i];

    if (direction === 'long') {
      if (high >= targetPrice) {
        const r = (targetPrice - entryPrice) / risk;
        return { outcome: 'WIN', r: parseFloat(r.toFixed(3)), durationMinutes: i + 1 };
      }
      if (low <= stopPrice) {
        const r = (stopPrice - entryPrice) / risk;
        return { outcome: 'LOSS', r: parseFloat(r.toFixed(3)), durationMinutes: i + 1 };
      }
    } else {
      if (low <= targetPrice) {
        const r = (entryPrice - targetPrice) / risk;
        return { outcome: 'WIN', r: parseFloat(r.toFixed(3)), durationMinutes: i + 1 };
      }
      if (high >= stopPrice) {
        const r = (entryPrice - stopPrice) / risk;
        return { outcome: 'LOSS', r: parseFloat(r.toFixed(3)), durationMinutes: i + 1 };
      }
    }
  }

  return { outcome: 'TIMEOUT', r: 0, durationMinutes: window.length };
}
