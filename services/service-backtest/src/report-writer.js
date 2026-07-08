import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { calcMetrics, formatTable } from '@borsa-bot/core-backtest/src/domain/reporter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '../../../backtest-results');

export function generateReport(tradesBySymbol, period) {
  const bySymbol = {};
  const allTrades = [];

  for (const [symbol, trades] of Object.entries(tradesBySymbol)) {
    bySymbol[symbol] = { ...calcMetrics(trades), trades };
    allTrades.push(...trades);
  }
  const total = calcMetrics(allTrades);

  console.log('\n=== BACKTEST RAPORU ===');
  console.log(`Dönem: ${period.from} → ${period.to} (${period.days} gün)`);
  console.log('\n' + formatTable(bySymbol, total) + '\n');

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const filename = `${ts}.json`;
  const payload = {
    generatedAt: now.toISOString(),
    period,
    symbols: Object.keys(tradesBySymbol),
    summary: total,
    bySymbol: Object.fromEntries(
      Object.entries(bySymbol).map(([sym, m]) => [sym, { ...m }])
    ),
  };

  mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = join(RESULTS_DIR, filename);
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Rapor kaydedildi: backtest-results/${filename}`);
}
