// Lab (2026-09-30) — İLERİ TEST CLI. Dondurulmuş adayları (F1 momentum, funding uçları) yalnızca
// FORWARD.start (2026-10-01) sonrası veriyle değerlendirir. Kâğıt üstü: para riski yok.
//
// Kullanım (veriyi güncelleyip raporlar; haftada bir çalıştırmak yeterli — Bitget funding ~90 gün saklar):
//   npm run backtest:forward
//   node --env-file=.env services/service-backtest/src/forward.js     # yalnız rapor (veri güncellemeden)
// ⚠️ Sunucuda DEĞİL, local'de çalıştır.
import pg from 'pg';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadLabData } from './lab-data.js';
import { FORWARD, evaluateForwardF1, evaluateForwardTip1 } from '@borsa-bot/core-backtest/src/domain/lab/lab-forward.js';
import { buildForwardReport } from '@borsa-bot/core-backtest/src/domain/lab/forward-report.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '../../../backtest-results');
const { Pool } = pg;

async function main() {
  if (!process.env.DATABASE_URL) { console.error('[forward] DATABASE_URL tanımlı değil. --env-file=.env ile çalıştır.'); process.exit(1); }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const now = Date.now();
  const { seriesList, fundingForDay, symbolsData } = await loadLabData({ pool, now, log: (...a) => console.log('[forward]', ...a) });

  // Veri tazeliği: son tamamlanmış gün dünse ileri dönem güncel demektir.
  const lastDay = Math.max(...seriesList.map((s) => s.candles.at(-1).timestamp));
  const stale = Math.floor(now / 86_400_000) * 86_400_000 - 86_400_000 - lastDay;
  if (stale > 0) console.warn(`[forward] ⚠️ günlük mumlar ${Math.round(stale / 86_400_000)} gün geride — önce: npm run backtest:forward (veriyi günceller)`);

  const results = [
    evaluateForwardF1({ seriesList, fundingForDay, now }),
    evaluateForwardTip1({ symbolsData, now }),
  ];
  const md = buildForwardReport({ generatedAt: new Date(now).toISOString(), forwardStart: FORWARD.start, now, results });

  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date(now).toISOString().slice(0, 10);
  writeFileSync(join(RESULTS_DIR, `forward-${stamp}.json`), JSON.stringify({ generatedAt: new Date(now).toISOString(), forward: FORWARD, results }, null, 2));
  writeFileSync(join(RESULTS_DIR, `forward-${stamp}.md`), md);
  console.log(`\n${md}\n[forward] kaydedildi: backtest-results/forward-${stamp}.json / .md`);
  await pool.end();
}

main().catch((err) => { console.error('[forward] Kritik hata:', err.stack ?? err.message); process.exit(1); });
