// Faz 1.5 (kalıcı mum deposu): candles tablosuna (db-schemas/03-candles.sql) upsert
// ve okuma. Backtest/sweep artık her çalıştırmada Bitget REST'ten sıfırdan çekmek
// yerine buradan okuyabilir — tekrarlanabilir, hızlı, ve ML eğitim seti için
// tarihsel feature verisi biriktirir. Backfill script'i (backfill-candles.js)
// core/service-backtest/src/infrastructure/fetcher.js'in fetchCandles'ını
// kullanıp bu repository'ye yazar.

const UPSERT_BATCH_SIZE = 1000; // Postgres parametre limiti (65535) koruması: 1000×8 = 8000

export function makeCandleStoreRepository({ db }) {
  async function upsertCandles(symbol, tf, candles) {
    if (!candles.length) return;

    for (let start = 0; start < candles.length; start += UPSERT_BATCH_SIZE) {
      const batch = candles.slice(start, start + UPSERT_BATCH_SIZE);
      const values = [];
      const placeholders = batch.map((c, idx) => {
        const base = idx * 8;
        values.push(symbol, tf, c.timestamp, c.open, c.high, c.low, c.close, c.volume);
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`;
      });

      const sql = `
        INSERT INTO candles (symbol, tf, ts, open, high, low, close, volume)
        VALUES ${placeholders.join(',')}
        ON CONFLICT (symbol, tf, ts) DO UPDATE SET
          open = EXCLUDED.open,
          high = EXCLUDED.high,
          low = EXCLUDED.low,
          close = EXCLUDED.close,
          volume = EXCLUDED.volume
      `;
      await db.query(sql, values);
    }
  }

  async function getCandles(symbol, tf, { fromTs, toTs } = {}) {
    const params = [symbol, tf];
    let where = 'symbol = $1 AND tf = $2';
    if (fromTs != null) {
      params.push(fromTs);
      where += ` AND ts >= $${params.length}`;
    }
    if (toTs != null) {
      params.push(toTs);
      where += ` AND ts <= $${params.length}`;
    }

    const sql = `
      SELECT ts, open, high, low, close, volume
      FROM candles
      WHERE ${where}
      ORDER BY ts ASC
    `;
    const result = await db.query(sql, params);
    return result.rows.map((r) => ({
      timestamp: parseInt(r.ts, 10),
      open: parseFloat(r.open),
      high: parseFloat(r.high),
      low: parseFloat(r.low),
      close: parseFloat(r.close),
      volume: parseFloat(r.volume),
    }));
  }

  async function getCoverage(symbol, tf) {
    const sql = `
      SELECT MIN(ts) AS min_ts, MAX(ts) AS max_ts, COUNT(*) AS n
      FROM candles
      WHERE symbol = $1 AND tf = $2
    `;
    const result = await db.query(sql, [symbol, tf]);
    const row = result.rows[0];
    return {
      minTs: row.min_ts != null ? parseInt(row.min_ts, 10) : null,
      maxTs: row.max_ts != null ? parseInt(row.max_ts, 10) : null,
      count: parseInt(row.n, 10),
    };
  }

  return { upsertCandles, getCandles, getCoverage };
}
