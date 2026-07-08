import datasources from '@borsa-bot/datasource';

export async function saveSignal({
  symbol, direction, triggerTimeframe, entryPrice, stopPrice, targetPrice,
  rrRatio, confluenceScore, indicatorsSnapshot, liqPressureScore, liqDirection,
}) {
  const { postgres } = datasources;
  const sql = `
    INSERT INTO signals (
      symbol, direction, trigger_timeframe, entry_price, stop_price, target_price,
      rr_ratio, confluence_score, indicators_snapshot, liq_pressure_score, liq_direction
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING id, created_at
  `;
  const values = [
    symbol, direction, triggerTimeframe,
    entryPrice, stopPrice, targetPrice,
    rrRatio, confluenceScore,
    JSON.stringify(indicatorsSnapshot),
    liqPressureScore ?? null,
    liqDirection ?? null,
  ];
  const result = await postgres.query(sql, values);
  return result.rows[0];
}

export async function createOutcome(signalId) {
  const { postgres } = datasources;
  const sql = `
    INSERT INTO signal_outcomes (signal_id, status)
    VALUES ($1, 'pending')
    RETURNING id
  `;
  const result = await postgres.query(sql, [signalId]);
  return result.rows[0];
}

export async function getPendingOutcomes() {
  const { postgres } = datasources;
  const sql = `
    SELECT
      o.id AS outcome_id,
      o.signal_id,
      o.status,
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
  const result = await postgres.query(sql);
  return result.rows;
}

export async function resolveOutcome(outcomeId, { status, exitPrice, pnlR }) {
  const { postgres } = datasources;
  const sql = `
    UPDATE signal_outcomes
    SET status = $1, exit_price = $2, pnl_r = $3, resolved_at = now()
    WHERE id = $4
  `;
  await postgres.query(sql, [status, exitPrice, pnlR ?? null, outcomeId]);
}

export async function getSignalStats() {
  const { postgres } = datasources;
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
        o.pnl_r - (0.0008 / NULLIF(ABS(s.entry_price - s.stop_price) / NULLIF(s.entry_price, 0), 0))
      ) FILTER (WHERE o.status IN ('tp_hit','sl_hit','timeout')), 4)    AS avg_r_after_fee,
      COUNT(*) FILTER (WHERE s.direction='long')                       AS total_long,
      COUNT(*) FILTER (WHERE s.direction='long' AND o.status='tp_hit') AS long_tp,
      COUNT(*) FILTER (WHERE s.direction='long' AND o.status='sl_hit') AS long_sl,
      COUNT(*) FILTER (WHERE s.direction='short')                      AS total_short,
      COUNT(*) FILTER (WHERE s.direction='short' AND o.status='tp_hit') AS short_tp,
      COUNT(*) FILTER (WHERE s.direction='short' AND o.status='sl_hit') AS short_sl,
      COUNT(*) FILTER (WHERE s.trigger_timeframe='1m')                 AS tf_1m,
      COUNT(*) FILTER (WHERE s.trigger_timeframe='5m')                 AS tf_5m,
      ROUND(AVG(s.confluence_score)*100, 1)                            AS avg_confluence
    FROM signal_outcomes o
    JOIN signals s ON s.id = o.signal_id
    WHERE s.created_at > now() - interval '7 days'
  `;
  const result = await postgres.query(sql);
  return result.rows[0];
}

export async function getTopSymbolStats() {
  const { postgres } = datasources;
  const sql = `
    SELECT
      s.symbol,
      COUNT(*)                                                          AS total,
      COUNT(*) FILTER (WHERE o.status = 'tp_hit')                      AS tp_hit,
      COUNT(*) FILTER (WHERE o.status = 'sl_hit')                      AS sl_hit,
      ROUND(AVG(CASE WHEN o.status='tp_hit' THEN 1.0 WHEN o.status='sl_hit' THEN 0.0 END)*100, 1) AS win_rate
    FROM signal_outcomes o
    JOIN signals s ON s.id = o.signal_id
    WHERE s.created_at > now() - interval '7 days'
      AND o.status IN ('tp_hit','sl_hit')
    GROUP BY s.symbol
    HAVING COUNT(*) >= 3
    ORDER BY win_rate DESC NULLS LAST
    LIMIT 10
  `;
  const result = await postgres.query(sql);
  return result.rows;
}

export async function getRecentSignals(limit = 20) {
  const { postgres } = datasources;
  const sql = `
    SELECT id, symbol, direction, trigger_timeframe, entry_price, stop_price, target_price,
           rr_ratio, confluence_score, indicators_snapshot, created_at
    FROM signals
    ORDER BY created_at DESC
    LIMIT $1
  `;
  const result = await postgres.query(sql, [limit]);
  return result.rows;
}
