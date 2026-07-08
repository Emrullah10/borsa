// Kırılım (breakdown) sorgularında sadece bu whitelist'teki grup ifadeleri kullanılabilir.
// Ham `by` girdisi ASLA SQL'e interpolate edilmez — sadece bu map'te lookup yapılır.
const BREAKDOWN_GROUP_EXPR = {
  regime: "COALESCE(s.regime, 'unknown')",
  tf: 's.trigger_timeframe',
  direction: 's.direction',
  hour: 'EXTRACT(HOUR FROM s.created_at)',
};

export function makeSignalRepository({ db, takerFee = 0.0006 } = {}) {
  async function saveSignal({
    symbol, direction, triggerTimeframe, entryPrice, stopPrice, targetPrice,
    rrRatio, confluenceScore, indicatorsSnapshot, liqPressureScore, liqDirection,
    regime, higherTfTrend,
  }) {
    const sql = `
      INSERT INTO signals (
        symbol, direction, trigger_timeframe, entry_price, stop_price, target_price,
        rr_ratio, confluence_score, indicators_snapshot, liq_pressure_score, liq_direction,
        regime, higher_tf_trend
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id, created_at
    `;
    const values = [
      symbol, direction, triggerTimeframe,
      entryPrice, stopPrice, targetPrice,
      rrRatio, confluenceScore,
      JSON.stringify(indicatorsSnapshot),
      liqPressureScore ?? null,
      liqDirection ?? null,
      regime ?? null,
      higherTfTrend ?? null,
    ];
    const result = await db.query(sql, values);
    return result.rows[0];
  }

  async function createOutcome(signalId) {
    const sql = `
      INSERT INTO signal_outcomes (signal_id, status)
      VALUES ($1, 'pending')
      RETURNING id
    `;
    const result = await db.query(sql, [signalId]);
    return result.rows[0];
  }

  async function getPendingOutcomes() {
    const sql = `
      SELECT
        o.id AS outcome_id,
        o.signal_id,
        o.status,
        o.sim_entry_price,
        o.created_at AS outcome_created_at,
        s.symbol,
        s.direction,
        s.entry_price,
        s.stop_price,
        s.target_price,
        s.created_at AS signal_created_at
      FROM signal_outcomes o
      JOIN signals s ON s.id = o.signal_id
      WHERE o.status IN ('pending', 'active')
      ORDER BY s.created_at DESC
    `;
    const result = await db.query(sql);
    return result.rows;
  }

  async function setSimEntry(outcomeId, simEntryPrice) {
    const sql = `
      UPDATE signal_outcomes
      SET sim_entry_price = $1
      WHERE id = $2
    `;
    await db.query(sql, [simEntryPrice, outcomeId]);
  }

  async function resolveOutcome(outcomeId, { status, exitPrice, pnlR, simPnlR, tieBreak, notes }) {
    const sql = `
      UPDATE signal_outcomes
      SET status = $1, exit_price = $2, pnl_r = $3, sim_pnl_r = $4, tie_break = $5,
          notes = COALESCE($6, notes), resolved_at = now()
      WHERE id = $7
    `;
    await db.query(sql, [
      status, exitPrice, pnlR ?? null,
      simPnlR ?? null, tieBreak ?? false, notes ?? null,
      outcomeId,
    ]);
  }

  async function getSignalStats(days = 7) {
    const sql = `
      SELECT
        COUNT(*)                                                          AS total,
        COUNT(*) FILTER (WHERE o.status = 'tp_hit')                      AS tp_hit,
        COUNT(*) FILTER (WHERE o.status = 'sl_hit')                      AS sl_hit,
        COUNT(*) FILTER (WHERE o.status = 'timeout')                     AS timeout,
        COUNT(*) FILTER (WHERE o.status IN ('pending','active'))         AS pending,
        ROUND(AVG(CASE WHEN o.status='tp_hit' THEN 1.0 WHEN o.status='sl_hit' THEN 0.0 END)*100, 1) AS win_rate,
        ROUND(
          CASE WHEN COALESCE(SUM(o.pnl_r) FILTER (WHERE o.pnl_r < 0), 0) = 0 THEN NULL
          ELSE SUM(o.pnl_r) FILTER (WHERE o.pnl_r > 0) /
               ABS(SUM(o.pnl_r) FILTER (WHERE o.pnl_r < 0))
          END, 2
        )                                                                  AS profit_factor,
        ROUND(AVG(o.pnl_r) FILTER (WHERE o.status IN ('tp_hit','sl_hit','timeout')), 4) AS avg_r,
        ROUND(AVG(
          o.pnl_r - ((2 * ${takerFee}) / NULLIF(ABS(s.entry_price - s.stop_price) / NULLIF(s.entry_price, 0), 0))
        ) FILTER (WHERE o.status IN ('tp_hit','sl_hit','timeout')), 4)    AS avg_r_after_fee,
        COUNT(*) FILTER (WHERE s.direction='long')                       AS total_long,
        COUNT(*) FILTER (WHERE s.direction='long' AND o.status='tp_hit') AS long_tp,
        COUNT(*) FILTER (WHERE s.direction='long' AND o.status='sl_hit') AS long_sl,
        COUNT(*) FILTER (WHERE s.direction='short')                      AS total_short,
        COUNT(*) FILTER (WHERE s.direction='short' AND o.status='tp_hit') AS short_tp,
        COUNT(*) FILTER (WHERE s.direction='short' AND o.status='sl_hit') AS short_sl,
        COUNT(*) FILTER (WHERE s.trigger_timeframe='1m')                 AS tf_1m,
        COUNT(*) FILTER (WHERE s.trigger_timeframe='5m')                 AS tf_5m,
        COUNT(*) FILTER (WHERE o.tie_break)                              AS tie_breaks,
        ROUND(AVG(s.confluence_score)*100, 1)                            AS avg_confluence,
        ROUND(AVG(
          EXTRACT(EPOCH FROM (o.resolved_at - s.created_at))/60
        ) FILTER (WHERE o.status = 'tp_hit'), 1)                          AS avg_min_to_tp,
        ROUND(AVG(
          EXTRACT(EPOCH FROM (o.resolved_at - s.created_at))/60
        ) FILTER (WHERE o.status = 'sl_hit'), 1)                          AS avg_min_to_sl,
        ROUND(
          COUNT(*) FILTER (WHERE o.status = 'timeout')::numeric
          / NULLIF(COUNT(*) FILTER (WHERE o.status IN ('tp_hit','sl_hit','timeout')), 0) * 100
        , 1)                                                              AS timeout_rate,
        ROUND(AVG(o.sim_pnl_r) FILTER (WHERE o.sim_pnl_r IS NOT NULL), 4)  AS avg_sim_r
      FROM signal_outcomes o
      JOIN signals s ON s.id = o.signal_id
      WHERE s.created_at > now() - make_interval(days => $1)
    `;
    const result = await db.query(sql, [days]);
    return result.rows[0];
  }

  async function getTopSymbolStats(days = 7) {
    const sql = `
      SELECT
        s.symbol,
        COUNT(*)                                                          AS total,
        COUNT(*) FILTER (WHERE o.status = 'tp_hit')                      AS tp_hit,
        COUNT(*) FILTER (WHERE o.status = 'sl_hit')                      AS sl_hit,
        ROUND(AVG(CASE WHEN o.status='tp_hit' THEN 1.0 WHEN o.status='sl_hit' THEN 0.0 END)*100, 1) AS win_rate
      FROM signal_outcomes o
      JOIN signals s ON s.id = o.signal_id
      WHERE s.created_at > now() - make_interval(days => $1)
        AND o.status IN ('tp_hit','sl_hit')
      GROUP BY s.symbol
      HAVING COUNT(*) >= 3
      ORDER BY win_rate DESC NULLS LAST
      LIMIT 10
    `;
    const result = await db.query(sql, [days]);
    return result.rows;
  }

  async function getStatsBreakdown({ by, days = 7 }) {
    const groupExpr = BREAKDOWN_GROUP_EXPR[by];
    if (!groupExpr) {
      throw new Error(`invalid breakdown 'by' value: ${by}`);
    }
    const sql = `
      SELECT
        ${groupExpr} AS bucket,
        COUNT(*)                                                          AS total,
        COUNT(*) FILTER (WHERE o.status = 'tp_hit')                      AS tp_hit,
        COUNT(*) FILTER (WHERE o.status = 'sl_hit')                      AS sl_hit,
        COUNT(*) FILTER (WHERE o.status = 'timeout')                     AS timeout,
        ROUND(AVG(CASE WHEN o.status='tp_hit' THEN 1.0 WHEN o.status='sl_hit' THEN 0.0 END)*100, 1) AS win_rate,
        ROUND(AVG(o.pnl_r) FILTER (WHERE o.status IN ('tp_hit','sl_hit','timeout')), 4) AS avg_r,
        ROUND(AVG(o.sim_pnl_r) FILTER (WHERE o.sim_pnl_r IS NOT NULL), 4)  AS avg_sim_r
      FROM signal_outcomes o
      JOIN signals s ON s.id = o.signal_id
      WHERE s.created_at > now() - make_interval(days => $1)
      GROUP BY bucket
      ORDER BY bucket
    `;
    const result = await db.query(sql, [days]);
    return result.rows;
  }

  async function getRecentSignals(limit = 20) {
    const sql = `
      SELECT id, symbol, direction, trigger_timeframe, entry_price, stop_price, target_price,
             rr_ratio, confluence_score, indicators_snapshot, created_at
      FROM signals
      ORDER BY created_at DESC
      LIMIT $1
    `;
    const result = await db.query(sql, [limit]);
    return result.rows;
  }

  return {
    saveSignal,
    createOutcome,
    getPendingOutcomes,
    setSimEntry,
    resolveOutcome,
    getSignalStats,
    getTopSymbolStats,
    getStatsBreakdown,
    getRecentSignals,
  };
}
