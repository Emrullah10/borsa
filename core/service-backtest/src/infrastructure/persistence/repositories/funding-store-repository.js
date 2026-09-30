// Lab (2026-09-30): funding_rates tablosu (db-schemas/04-funding-rates.sql) upsert + okuma.
// candle-store-repository.js ile aynı kalıp.
const UPSERT_BATCH_SIZE = 4000; // 4000 × 4 param = 16000 < Postgres 65535 limiti

export function makeFundingStoreRepository({ db }) {
  async function upsertFunding(source, symbol, rows) {
    if (!rows.length) return;
    for (let start = 0; start < rows.length; start += UPSERT_BATCH_SIZE) {
      const batch = rows.slice(start, start + UPSERT_BATCH_SIZE);
      const values = [];
      const placeholders = batch.map((r, idx) => {
        const base = idx * 4;
        values.push(source, symbol, r.timestamp, r.rate);
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4})`;
      });
      await db.query(
        `INSERT INTO funding_rates (source, symbol, ts, rate)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (source, symbol, ts) DO UPDATE SET rate = EXCLUDED.rate`,
        values,
      );
    }
  }

  async function getFunding(source, symbol, { fromTs, toTs } = {}) {
    const params = [source, symbol];
    let where = 'source = $1 AND symbol = $2';
    if (fromTs != null) { params.push(fromTs); where += ` AND ts >= $${params.length}`; }
    if (toTs != null) { params.push(toTs); where += ` AND ts <= $${params.length}`; }
    const result = await db.query(
      `SELECT ts, rate FROM funding_rates WHERE ${where} ORDER BY ts ASC`, params,
    );
    return result.rows.map((r) => ({ timestamp: parseInt(r.ts, 10), rate: parseFloat(r.rate) }));
  }

  async function getCoverage(source, symbol) {
    const result = await db.query(
      `SELECT MIN(ts) AS min_ts, MAX(ts) AS max_ts, COUNT(*) AS n
       FROM funding_rates WHERE source = $1 AND symbol = $2`,
      [source, symbol],
    );
    const row = result.rows[0];
    return {
      minTs: row.min_ts != null ? parseInt(row.min_ts, 10) : null,
      maxTs: row.max_ts != null ? parseInt(row.max_ts, 10) : null,
      count: parseInt(row.n, 10),
    };
  }

  return { upsertFunding, getFunding, getCoverage };
}
