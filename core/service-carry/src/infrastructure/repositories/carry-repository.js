// carry_* tabloları (db-schemas/migrations/2026-10-27-01-carry.sql). NUMERIC kolonlar pg'den
// STRING gelir → her okumada parseFloat (yoksa toplama string birleştirmeye döner).
const num = (v) => (v == null ? null : parseFloat(v));
const int = (v) => (v == null ? null : parseInt(v, 10));

function toPosition(r) {
  return {
    id: int(r.id), mode: r.mode, symbol: r.symbol, qty: num(r.qty), notionalUsd: num(r.notional_usd),
    entryApr: num(r.entry_apr), openedAt: int(r.opened_at), entrySpot: num(r.entry_spot), entryPerp: num(r.entry_perp),
    entryFees: num(r.entry_fees), status: r.status, closedAt: int(r.closed_at), exitSpot: num(r.exit_spot),
    exitPerp: num(r.exit_perp), exitFees: num(r.exit_fees), closeReason: r.close_reason,
    fundingUsd: num(r.funding_usd) ?? 0, lastFundingTs: int(r.last_funding_ts),
  };
}

const POSITION_SELECT = `
  SELECT p.*, COALESCE(l.funding_usd, 0) AS funding_usd, l.last_funding_ts
    FROM carry_positions p
    LEFT JOIN (SELECT position_id, SUM(amount_usd) AS funding_usd, MAX(ts) AS last_funding_ts
                 FROM carry_funding_ledger GROUP BY position_id) l ON l.position_id = p.id`;

export function makeCarryRepository({ db }) {
  async function getOpenPositions(mode) {
    const { rows } = await db.query(`${POSITION_SELECT} WHERE p.mode = $1 AND p.status = 'open' ORDER BY p.opened_at`, [mode]);
    return rows.map(toPosition);
  }

  async function getPositions(mode, { limit = 200 } = {}) {
    const { rows } = await db.query(`${POSITION_SELECT} WHERE p.mode = $1 ORDER BY p.opened_at DESC LIMIT $2`, [mode, limit]);
    return rows.map(toPosition);
  }

  async function insertPosition(mode, p) {
    const { rows } = await db.query(
      `INSERT INTO carry_positions (mode, symbol, qty, notional_usd, entry_apr, opened_at, entry_spot, entry_perp, entry_fees)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [mode, p.symbol, p.qty, p.notionalUsd, p.entryApr, p.openedAt, p.entrySpot, p.entryPerp, p.entryFees],
    );
    return int(rows[0].id);
  }

  async function closePosition(p) {
    await db.query(
      `UPDATE carry_positions SET status = 'closed', closed_at = $2, exit_spot = $3, exit_perp = $4, exit_fees = $5, close_reason = $6
        WHERE id = $1 AND status = 'open'`,
      [p.id, p.closedAt, p.exitSpot, p.exitPerp, p.exitFees, p.closeReason],
    );
  }

  // entries: [{ ts, rate, markPrice, amountUsd }] — PK (position_id, ts) → tekrar yazım zararsız.
  async function addFunding(positionId, entries) {
    for (const e of entries) {
      await db.query(
        `INSERT INTO carry_funding_ledger (position_id, ts, rate, mark_price, amount_usd)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (position_id, ts) DO NOTHING`,
        [positionId, e.ts, e.rate, e.markPrice, e.amountUsd],
      );
    }
  }

  async function fundingBetween(mode, fromTs, toTs) {
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(l.amount_usd), 0) AS s FROM carry_funding_ledger l
         JOIN carry_positions p ON p.id = l.position_id WHERE p.mode = $1 AND l.ts > $2 AND l.ts <= $3`,
      [mode, fromTs, toTs],
    );
    return num(rows[0].s);
  }

  async function getState(key) {
    const { rows } = await db.query('SELECT value FROM carry_state WHERE key = $1', [key]);
    return rows[0]?.value ?? null;
  }

  async function setState(key, value) {
    await db.query(
      `INSERT INTO carry_state (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, String(value)],
    );
  }

  async function seenAnnouncementIds(ids) {
    if (!ids.length) return new Set();
    const { rows } = await db.query('SELECT ann_id FROM carry_risk_events WHERE ann_id = ANY($1)', [ids]);
    return new Set(rows.map((r) => r.ann_id));
  }

  async function insertRiskEvent(e) {
    await db.query(
      `INSERT INTO carry_risk_events (ann_id, ann_title, ann_url, ann_time, symbols, severity, rule_severity,
                                      ai_severity, summary_tr, ai_model, ai_cost_usd, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (ann_id) DO NOTHING`,
      [e.annId, e.annTitle, e.annUrl, e.annTime, e.symbols, e.severity, e.ruleSeverity, e.aiSeverity,
        e.summary, e.model, e.costUsd, e.createdAt],
    );
  }

  // Son `days` günde exit/block işaretlenmiş coinler.
  async function getBlockedSymbols(sinceTs) {
    const { rows } = await db.query(
      `SELECT DISTINCT unnest(symbols) AS s FROM carry_risk_events
        WHERE severity IN ('exit','block') AND created_at >= $1`,
      [sinceTs],
    );
    return new Set(rows.map((r) => r.s));
  }

  async function getRiskEvents({ limit = 50 } = {}) {
    const { rows } = await db.query(
      `SELECT * FROM carry_risk_events WHERE severity <> 'none' ORDER BY created_at DESC LIMIT $1`, [limit],
    );
    return rows.map((r) => ({
      annId: r.ann_id, annTitle: r.ann_title, annUrl: r.ann_url, annTime: int(r.ann_time), symbols: r.symbols,
      severity: r.severity, ruleSeverity: r.rule_severity, aiSeverity: r.ai_severity, summary: r.summary_tr,
      model: r.ai_model, costUsd: num(r.ai_cost_usd), createdAt: int(r.created_at),
    }));
  }

  async function upsertDailyEquity(mode, { day, equityUsd, fundingUsd, openPositions }) {
    await db.query(
      `INSERT INTO carry_daily_equity (mode, day, equity_usd, funding_usd, open_positions) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (mode, day) DO UPDATE SET equity_usd = EXCLUDED.equity_usd, funding_usd = EXCLUDED.funding_usd,
         open_positions = EXCLUDED.open_positions`,
      [mode, day, equityUsd, fundingUsd, openPositions],
    );
  }

  async function getDailyEquity(mode) {
    const { rows } = await db.query('SELECT * FROM carry_daily_equity WHERE mode = $1 ORDER BY day', [mode]);
    return rows.map((r) => ({ day: int(r.day), equityUsd: num(r.equity_usd), fundingUsd: num(r.funding_usd), openPositions: int(r.open_positions) }));
  }

  async function saveOpportunities(day, rows) {
    await db.query('DELETE FROM carry_opportunities WHERE day = $1', [day]);
    for (const o of rows) {
      await db.query(
        `INSERT INTO carry_opportunities (day, symbol, apr, current_rate, interval_hours, spot_volume, perp_volume)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [day, o.symbol, o.apr, o.currentRate, o.intervalHours, o.spotVolume, o.perpVolume],
      );
    }
  }

  async function getLatestOpportunities() {
    const { rows } = await db.query(
      `SELECT * FROM carry_opportunities WHERE day = (SELECT MAX(day) FROM carry_opportunities) ORDER BY apr DESC`,
    );
    return rows.map((r) => ({
      day: int(r.day), symbol: r.symbol, apr: num(r.apr), currentRate: num(r.current_rate),
      intervalHours: int(r.interval_hours), spotVolume: num(r.spot_volume), perpVolume: num(r.perp_volume),
    }));
  }

  return {
    getOpenPositions, getPositions, insertPosition, closePosition, addFunding, fundingBetween,
    getState, setState, seenAnnouncementIds, insertRiskEvent, getBlockedSymbols, getRiskEvents,
    upsertDailyEquity, getDailyEquity, saveOpportunities, getLatestOpportunities,
  };
}
