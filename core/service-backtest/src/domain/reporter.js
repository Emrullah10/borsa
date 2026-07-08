export function calcMetrics(trades) {
  if (!trades.length) return { winRate: 0, profitFactor: 0, maxDrawdown: 0, avgR: 0, totalSignals: 0, timeouts: 0 };

  const decided = trades.filter(t => t.outcome !== 'TIMEOUT');
  const wins    = decided.filter(t => t.outcome === 'WIN');
  const losses  = decided.filter(t => t.outcome === 'LOSS');
  const timeouts = trades.filter(t => t.outcome === 'TIMEOUT').length;

  const winRate = decided.length ? wins.length / decided.length : 0;

  const totalWinR  = wins.reduce((s, t) => s + t.r, 0);
  const totalLossR = losses.reduce((s, t) => s + Math.abs(t.r), 0);
  const profitFactor = totalLossR > 0 ? totalWinR / totalLossR : totalWinR > 0 ? Infinity : 0;

  const avgR = trades.length ? trades.reduce((s, t) => s + t.r, 0) / trades.length : 0;

  let maxDrawdown = 0, currentDD = 0;
  for (const t of trades) {
    if (t.outcome === 'LOSS') { currentDD++; maxDrawdown = Math.max(maxDrawdown, currentDD); }
    else { currentDD = 0; }
  }

  return {
    winRate: parseFloat(winRate.toFixed(4)),
    profitFactor: parseFloat(profitFactor.toFixed(3)),
    maxDrawdown,
    avgR: parseFloat(avgR.toFixed(3)),
    totalSignals: trades.length,
    timeouts,
  };
}

export function formatTable(bySymbol, total) {
  const header = ['Symbol', 'Signals', 'Win%', 'PF', 'MaxDD', 'AvgR', 'Timeouts'];
  const rows = Object.entries(bySymbol).map(([sym, m]) => [
    sym,
    m.totalSignals,
    (m.winRate * 100).toFixed(1) + '%',
    m.profitFactor.toFixed(2),
    m.maxDrawdown,
    m.avgR.toFixed(2),
    m.timeouts,
  ]);
  rows.push([
    'TOTAL',
    total.totalSignals,
    (total.winRate * 100).toFixed(1) + '%',
    total.profitFactor.toFixed(2),
    total.maxDrawdown,
    total.avgR.toFixed(2),
    total.timeouts,
  ]);

  const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  const pad = (s, w) => String(s).padEnd(w);
  const line = widths.map(w => '-'.repeat(w)).join('  ');

  const lines = [
    header.map((h, i) => pad(h, widths[i])).join('  '),
    line,
    ...rows.map(r => r.map((v, i) => pad(v, widths[i])).join('  ')),
  ];
  return lines.join('\n');
}
