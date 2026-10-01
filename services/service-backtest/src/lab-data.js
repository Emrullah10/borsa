// Lab (2026-09-30) — DB'den lab verisini yükler (lab.js ve forward.js paylaşır).
import { fetchCryptoSymbolSet } from '@borsa-bot/core-backtest/src/infrastructure/fetcher.js';
import { makeCandleStoreRepository } from '@borsa-bot/core-backtest/src/infrastructure/persistence/repositories/candle-store-repository.js';
import { makeFundingStoreRepository } from '@borsa-bot/core-backtest/src/infrastructure/persistence/repositories/funding-store-repository.js';
import { buildSeries, DAY } from '@borsa-bot/core-backtest/src/domain/lab/basket-factors.js';
import { fundingZScores } from '@borsa-bot/core-backtest/src/domain/lab/funding-extreme.js';
import { indexFundingByDay, mergeFundingSeries } from '@borsa-bot/core-backtest/src/domain/lab/cost-model.js';

const HOUR = 3_600_000;

async function distinctSymbols(pool, tf) {
  const { rows } = await pool.query('SELECT DISTINCT symbol FROM candles WHERE tf = $1', [tf]);
  return rows.map((r) => r.symbol);
}

// Statik hacim sırası (kayma katmanı için): son 90 günün ort. USD hacmi. Yaklaşık — raporda belirtilir.
function volumeRanks(seriesList) {
  const avg = seriesList.map((s) => {
    const tail = s.candles.slice(-90);
    return { symbol: s.symbol, v: tail.reduce((a, c) => a + c.close * c.volume, 0) / Math.max(1, tail.length) };
  }).sort((a, b) => b.v - a.v);
  return new Map(avg.map((x, i) => [x.symbol, i + 1]));
}

/**
 * @returns {{seriesList, ranks, fundingData, fundingForDay, symbolsData, cryptoSet}}
 *  seriesList : Tip 2 günlük seriler (yalnız tamamlanmış günler, yalnız kripto)
 *  symbolsData: Tip 1 (1h mum + funding z-skorları + PnL serisi)
 */
export async function loadLabData({ pool, quick = false, now = Date.now(), log = () => {} }) {
  const candleRepo = makeCandleStoreRepository({ db: pool });
  const fundingRepo = makeFundingStoreRepository({ db: pool });

  // --- Evren: yalnız KRİPTO (RWA hisse/ETF/emtia hariç) ---
  const cryptoSet = await fetchCryptoSymbolSet();
  log(`kripto sembol (RWA hariç, normal durum): ${cryptoSet.size}`);

  // --- Günlük mumlar (Tip 2) ---
  let dailySymbols = (await distinctSymbols(pool, '1d')).filter((s) => cryptoSet.has(s));
  const seriesAll = [];
  for (const symbol of dailySymbols) {
    const candles = (await candleRepo.getCandles(symbol, '1d')).filter((c) => c.timestamp + DAY <= now); // yalnız tamamlanmış günler
    if (candles.length >= 90) seriesAll.push(buildSeries(symbol, candles));
  }
  if (!seriesAll.length) { console.error('[lab] günlük mum yok — önce: backtest:backfill-candles --tf 1d'); throw new Error('günlük mum yok'); }
  const ranks = volumeRanks(seriesAll);
  const seriesList = quick ? seriesAll.filter((s) => ranks.get(s.symbol) <= 40) : seriesAll;
  log(`Tip 2 evreni: ${seriesList.length} sembol (günlük)`);

  // --- Funding (iki kaynak) ---
  const fundingData = new Map();
  const loadFunding = async (symbol) => {
    if (fundingData.has(symbol)) return fundingData.get(symbol);
    const [bitget, binance] = await Promise.all([fundingRepo.getFunding('bitget', symbol), fundingRepo.getFunding('binance', symbol)]);
    const d = {
      bitget, binance, bitgetByDay: indexFundingByDay(bitget), binanceByDay: indexFundingByDay(binance),
      bitgetMinDay: bitget.length ? Math.floor(bitget[0].timestamp / DAY) * DAY : null,
      binanceMinDay: binance.length ? Math.floor(binance[0].timestamp / DAY) * DAY : null,
    };
    fundingData.set(symbol, d);
    return d;
  };
  for (const s of seriesList) await loadFunding(s.symbol);

  // Bitget'in kendi verisi varsa o, yoksa Binance vekili, hiçbiri yoksa null (= bilinmiyor → 0 varsayılır ve sayılır)
  const fundingForDay = (symbol, u) => {
    const d = fundingData.get(symbol);
    if (!d) return null;
    if (d.bitgetMinDay != null && u >= d.bitgetMinDay) return d.bitgetByDay.get(u) ?? 0;
    if (d.binanceMinDay != null && u >= d.binanceMinDay) return d.binanceByDay.get(u) ?? 0;
    return null;
  };

  // --- Tip 1 verisi (1h mum + funding sinyal serisi) ---
  let hourlySymbols = (await distinctSymbols(pool, '1h')).filter((s) => cryptoSet.has(s));
  if (quick) hourlySymbols = hourlySymbols.filter((s) => (ranks.get(s) ?? 999) <= 20);
  const symbolsData = [];
  for (const symbol of hourlySymbols) {
    const f = await loadFunding(symbol);
    const signalSeries = f.binance.length >= 200 ? f.binance : f.bitget; // sinyal: uzun geçmişli kaynak
    if (signalSeries.length < 200) continue;
    const candles1h = (await candleRepo.getCandles(symbol, '1h')).filter((c) => c.timestamp + HOUR <= now);
    if (candles1h.length < 500) continue;
    symbolsData.push({
      symbol, candles1h, rank: ranks.get(symbol),
      zScores: fundingZScores(signalSeries, { window: 90, minPeriods: 30 }),
      pnlSeries: mergeFundingSeries(f.bitget, f.binance), // PnL: Bitget varsa o, öncesi Binance
    });
  }
  log(`Tip 1 evreni: ${symbolsData.length} sembol (1h + funding)`);


  return { seriesList, ranks, fundingData, fundingForDay, symbolsData, cryptoSet };
}
