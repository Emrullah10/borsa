// "Şu an karar verilse ne yapılırdı?" — hiçbir pozisyon açmaz/kapatmaz, Telegram atmaz.
// Yalnız funding geçmişini günceller (funding_rates) ve dondurulmuş kurallarla adayları listeler.
//   npm run carry:scan
import pg from 'pg';
import loadConfig from '@borsa-bot/config';
import helper from '@borsa-bot/helper';
import { CARRY_RULES } from '@borsa-bot/core-carry/src/domain/carry-config.js';
import appConfigSchema from '../configs/app-config.js';
import { buildContainer } from './container.js';

const config = { ...loadConfig(appConfigSchema), telegramBotToken: '', telegramChatId: '' };
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 4 });
const { engine } = buildContainer({ config, db: pool });

const pct = (v) => `%${(v * 100).toFixed(1)}`.padStart(8);
const musd = (v) => `$${(v / 1e6).toFixed(1)}M`.padStart(9);

try {
  console.log(`Kurallar: son ${CARRY_RULES.lookbackDays} gün · ${CARRY_RULES.slots} slot · aç ≥ ${pct(CARRY_RULES.entryApr).trim()} · kapat < ${pct(CARRY_RULES.exitApr).trim()}\n`);
  const r = await engine.runDailyDecision({ force: true, dryRun: true });
  console.log(`Taşıma günü ${new Date(r.day).toISOString().slice(0, 10)} · evren ${r.universeSize} coin (kripto, spotu var, spot ≥$1M, perp ≥$5M) · tam 14 günlük verisi olan ${r.candidateCount}`);
  console.log('\n  Coin            14g yıllık  şu anki/aralık   spot hacim  perp hacim');
  for (const o of r.opportunities) {
    const cur = o.currentRate == null ? '—' : `${(o.currentRate * 100).toFixed(4)}%/${o.intervalHours}s`;
    const mark = r.decision.open.some((x) => x.symbol === o.symbol) ? ' ← AÇILIR' : o.blocked ? ' ⛔ blok' : '';
    console.log(`  ${o.symbol.padEnd(14)}${pct(o.apr)}   ${cur.padEnd(15)}${musd(o.spotVolume)}  ${musd(o.perpVolume)}${mark}`);
  }
  if (r.decision.close.length) console.log(`\nKapanacak: ${r.decision.close.map((c) => `${c.symbol} (${c.reason})`).join(', ')}`);
  console.log(`\nKarar: ${r.decision.open.length} aç, ${r.decision.close.length} kapat, ${r.decision.keep.length} koru`);
} catch (err) {
  helper.log.error(`[carry:scan] ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
