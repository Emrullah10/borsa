// Faz 1.5 (kalıcı mum deposu) — Bitget REST'ten geçmiş mum verisi çekip
// candles tablosuna (db-schemas/03-candles.sql) yazar. Backtest/sweep bundan
// sonra REST'ten sıfırdan çekmek yerine buradan okuyabilir.
//
// Kullanım:
//   node --env-file=.env services/service-backtest/src/backfill-candles.js
//   node --env-file=.env services/service-backtest/src/backfill-candles.js --days 90
//   node --env-file=.env services/service-backtest/src/backfill-candles.js --symbols BTCUSDT,ETHUSDT --tf 5m,15m,1h,4h
//   node --env-file=.env services/service-backtest/src/backfill-candles.js --tf 1d --days 900 --universe-min-volume 1000000
//
// ⚠️ Sunucuda DEĞİL, local'de çalıştır — REST fırtınası daha önce sunucuyu
// termal kapanmaya sürüklemişti (bkz. plan Faz 1.5 notu).
import pg from 'pg';
import { fetchCandles, fetchLiquidUniverse } from '@borsa-bot/core-backtest/src/infrastructure/fetcher.js';
import { makeCandleStoreRepository } from '@borsa-bot/core-backtest/src/infrastructure/persistence/repositories/candle-store-repository.js';

const { Pool } = pg;

// Plan hedefi: işlem evreni ~20 sembol × 1m × 90 gün + BTC 4h/5m rejim serisi.
const DEFAULT_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'DOGEUSDT', 'ADAUSDT',
  'AVAXUSDT', 'LINKUSDT', 'SUIUSDT', 'EVAAUSDT', 'LABUSDT', 'VANRYUSDT',
  'KORUUSDT', 'VELVETUSDT', 'WIFUSDT', 'ORDIUSDT', 'PEOPLEUSDT',
];
// Faz B2 (yapısal onarım, 2026-09-02): 1m çıktı, 15m/1h eklendi — bkz. sweep.js
// TF_OPTIONS notu (fee/risk oranı 1m'de likit coinlerde %30-42, taşınamaz).
const DEFAULT_TFS = ['5m', '15m', '1h', '4h'];
const DEFAULT_DAYS = 90;
// Bitget REST granularity: saat-ve-üstü zaman dilimleri için 'granularity'
// büyük harf bekler (bkz. bitget-ws.js'teki aynı normalizasyon), tabloda ise
// küçük harf 'timeframe' enum değeri kullanılıyor — normalize burada yapılır.
// Lab (2026-09-30): '1d' → '1Dutc' (00:00 UTC kapanış — funding ödemeleriyle hizalı).
// Bitget'in düz '1D' mumu 16:00 UTC'de kapanır ve funding/gün sınırlarıyla kaymış olur.
const TF_TO_GRANULARITY = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1Dutc' };

function parseArgs(argv) {
  const args = { symbols: DEFAULT_SYMBOLS, tfs: DEFAULT_TFS, days: DEFAULT_DAYS };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--symbols' && argv[i + 1]) {
      args.symbols = argv[i + 1].split(',').map((s) => s.trim().toUpperCase());
      i++;
    } else if (argv[i] === '--tf' && argv[i + 1]) {
      args.tfs = argv[i + 1].split(',').map((s) => s.trim());
      i++;
    } else if (argv[i] === '--days' && argv[i + 1]) {
      args.days = parseInt(argv[i + 1], 10);
      i++;
    } else if (argv[i] === '--universe-min-volume' && argv[i + 1]) {
      // Lab: sabit liste yerine canlı tickers'tan 24s USDT hacmi >= eşik olan tüm perp'ler.
      args.minVolume = parseFloat(argv[i + 1]);
      i++;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const { tfs, days } = parsed;
  const symbols = parsed.minVolume != null
    ? await fetchLiquidUniverse({ minVolumeUsdt: parsed.minVolume })
    : parsed.symbols;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[backfill-candles] DATABASE_URL tanımlı değil. --env-file=.env ile çalıştır.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const repo = makeCandleStoreRepository({ db: pool });

  console.log(`[backfill-candles] ${symbols.length} sembol × ${tfs.length} TF × ${days} gün başlıyor...`);
  console.log(`Semboller: ${symbols.join(', ')}`);
  console.log(`TF'ler: ${tfs.join(', ')}\n`);

  let totalWritten = 0;
  for (const symbol of symbols) {
    for (const tf of tfs) {
      const granularity = TF_TO_GRANULARITY[tf] ?? tf;
      try {
        const candles = await fetchCandles(symbol, granularity, days);
        if (!candles.length) {
          console.log(`[${symbol}.${tf}] veri yok, atlanıyor.`);
          continue;
        }
        await repo.upsertCandles(symbol, tf, candles);
        totalWritten += candles.length;
        console.log(`[${symbol}.${tf}] ${candles.length} mum yazıldı.`);
      } catch (err) {
        console.error(`[${symbol}.${tf}] HATA: ${err.message} — atlanıyor.`);
      }
      await sleep(200); // Bitget rate limit koruması (fetcher.js'teki RATE_LIMIT_MS ile aynı ruh)
    }
  }

  console.log(`\n[backfill-candles] Tamamlandı. Toplam ${totalWritten} mum yazıldı/güncellendi.`);
  await pool.end();
}

main().catch((err) => {
  console.error('[backfill-candles] Kritik hata:', err.message);
  process.exit(1);
});
