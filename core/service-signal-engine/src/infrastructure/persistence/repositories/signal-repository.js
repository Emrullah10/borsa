// Kırılım (breakdown) sorgularında sadece bu whitelist'teki grup ifadeleri kullanılabilir.
// Ham `by` girdisi ASLA SQL'e interpolate edilmez — sadece bu map'te lookup yapılır.
const BREAKDOWN_GROUP_EXPR = {
  regime: "COALESCE(s.regime, 'unknown')",
  tf: 's.trigger_timeframe',
  direction: 's.direction',
  hour: 'EXTRACT(HOUR FROM s.created_at)',
  // Faz 3.5 (AI kapısı ölçümü): ai_approved=NULL (AI vetosu hiç çalışmadı/kapalıydı)
  // ile true/false (AI çalıştı, onayladı/reddetti) sonuçlarını ayrı raporlar —
  // AI'nın gerçek faydası varsayılmaz, sweep/canlı veriyle ÖLÇÜLÜR.
  ai_approved: "COALESCE(s.ai_approved::text, 'not_evaluated')",
};

export function makeSignalRepository({ db, takerFee = 0.0006, feeRoundtrip } = {}) {
  // Faz 0.6 (kapı/muhasebe tutarlılığı): fee_adj_pnl artık, verilmişse, giriş
  // kapısının (setup-builder.js meetsFeeFloor) kullandığı TAM roundtrip maliyeti
  // kullanır (2*takerFee + slippage + exitSlippage), sadece 2*takerFee değil.
  // Verilmezse eski davranış (2*takerFee) korunur — geriye uyumlu.
  const effectiveFeeRoundtrip = feeRoundtrip ?? (2 * takerFee);
  async function saveSignal({
    symbol, direction, triggerTimeframe, entryPrice, stopPrice, targetPrice,
    rrRatio, confluenceScore, indicatorsSnapshot, liqPressureScore, liqDirection,
    regime, higherTfTrend,
    // Faz 3.5 (AI kapısı ölçümü): event_veto.py'nin (Faz 3.4) çıktısı — opsiyonel,
    // verilmezse null (AI vetosu şu an sinyal yolunda ZORUNLU değil, ölçüm amaçlı).
    aiApproved, aiConfidence, aiReason,
  }) {
    const sql = `
      INSERT INTO signals (
        symbol, direction, trigger_timeframe, entry_price, stop_price, target_price,
        rr_ratio, confluence_score, indicators_snapshot, liq_pressure_score, liq_direction,
        regime, higher_tf_trend, ai_approved, ai_confidence, ai_reason
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
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
      aiApproved ?? null,
      aiConfidence ?? null,
      aiReason ?? null,
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
    // Faz 0.3 (B13 düzeltmesi — "zombi pending"): yaş sınırı olmadan bu sorgu
    // haftalarca eski pending/active satırları döndürüyordu. Bunlar güncel
    // mumlarla eşleşince sim_entry_price gerçek fiyattan ortalama %4.97 sapıyordu
    // (bkz. isSimEntryFillable, B2). Ölçülen ortalama çözülme süresi 27.93 saatti
    // (timeout 4 saat olmasına rağmen). 6 saat, en geniş timeout'un (4h TF) makul
    // bir üstü — bundan eski satırlar gerçek bir sonuç değil, kaçırılmış veridir.
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
        AND s.created_at > now() - interval '6 hours'
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

  // Faz 3 execution doğrulama (borsa-strategy-validation-plan): gerçek dolum
  // fiyatının sistemin sim_entry_price'ıyla ne kadar uyuştuğunu ölçmek içindir —
  // istatistiksel edge kanıtı değil, sadece slippage modelinin doğruluğu.
  async function recordRealFill(outcomeId, { realEntryPrice, realExitPrice, realEntryAt, notes }) {
    const sql = `
      UPDATE signal_outcomes
      SET real_entry_price = $1, real_exit_price = $2, real_entry_at = $3, real_notes = $4
      WHERE id = $5
    `;
    await db.query(sql, [
      realEntryPrice ?? null, realExitPrice ?? null, realEntryAt ?? null, notes ?? null,
      outcomeId,
    ]);
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
    // fee_adj_pnl: fee/slippage düşülmüş R (avg_r_after_fee ile aynı formül,
    // profit_factor_after_fee ve win_rate_incl_timeout için de kullanılır).
    // Faz 0.6: effectiveFeeRoundtrip artık giriş kapısıyla (setup-builder.js
    // meetsFeeFloor) aynı maliyet varsayımını kullanır.
    const sql = `
      WITH base AS (
        SELECT
          o.*, s.direction, s.trigger_timeframe, s.confluence_score, s.created_at AS signal_created_at,
          o.pnl_r - ((${effectiveFeeRoundtrip}) / NULLIF(ABS(s.entry_price - s.stop_price) / NULLIF(s.entry_price, 0), 0)) AS fee_adj_pnl
        FROM signal_outcomes o
        JOIN signals s ON s.id = o.signal_id
        WHERE s.created_at > now() - make_interval(days => $1)
      )
      SELECT
        COUNT(*)                                                          AS total,
        COUNT(*) FILTER (WHERE status = 'tp_hit')                        AS tp_hit,
        COUNT(*) FILTER (WHERE status = 'sl_hit')                        AS sl_hit,
        COUNT(*) FILTER (WHERE status = 'timeout')                       AS timeout,
        COUNT(*) FILTER (WHERE status IN ('pending','active'))           AS pending,
        -- win_rate paydası: SADECE tp_hit+sl_hit (total ile karıştırılmasın, bkz. resolved_n)
        COUNT(*) FILTER (WHERE status IN ('tp_hit','sl_hit'))            AS resolved_n,
        ROUND(AVG(CASE WHEN status='tp_hit' THEN 1.0 WHEN status='sl_hit' THEN 0.0 END)*100, 1) AS win_rate,
        -- timeout dahil: timeout pnl_r>0 ise kazanç sayılır (C1 düzeltmesi)
        ROUND(AVG(
          CASE
            WHEN status = 'tp_hit' THEN 1.0
            WHEN status = 'sl_hit' THEN 0.0
            WHEN status = 'timeout' THEN CASE WHEN pnl_r > 0 THEN 1.0 ELSE 0.0 END
          END
        ) FILTER (WHERE status IN ('tp_hit','sl_hit','timeout')) * 100, 1) AS win_rate_incl_timeout,
        ROUND(
          CASE WHEN COALESCE(SUM(pnl_r) FILTER (WHERE pnl_r < 0), 0) = 0 THEN NULL
          ELSE SUM(pnl_r) FILTER (WHERE pnl_r > 0) /
               ABS(SUM(pnl_r) FILTER (WHERE pnl_r < 0))
          END, 2
        )                                                                  AS profit_factor,
        -- fee'li profit factor (C3 düzeltmesi): ham profit_factor fee'yi görmez
        ROUND(
          CASE WHEN COALESCE(SUM(fee_adj_pnl) FILTER (WHERE fee_adj_pnl < 0), 0) = 0 THEN NULL
          ELSE SUM(fee_adj_pnl) FILTER (WHERE fee_adj_pnl > 0) /
               ABS(SUM(fee_adj_pnl) FILTER (WHERE fee_adj_pnl < 0))
          END, 2
        )                                                                  AS profit_factor_after_fee,
        ROUND(AVG(pnl_r) FILTER (WHERE status IN ('tp_hit','sl_hit','timeout')), 4) AS avg_r,
        ROUND(AVG(fee_adj_pnl) FILTER (WHERE status IN ('tp_hit','sl_hit','timeout')), 4) AS avg_r_after_fee,
        COUNT(*) FILTER (WHERE direction='long')                         AS total_long,
        COUNT(*) FILTER (WHERE direction='long' AND status='tp_hit')     AS long_tp,
        COUNT(*) FILTER (WHERE direction='long' AND status='sl_hit')     AS long_sl,
        COUNT(*) FILTER (WHERE direction='short')                        AS total_short,
        COUNT(*) FILTER (WHERE direction='short' AND status='tp_hit')    AS short_tp,
        COUNT(*) FILTER (WHERE direction='short' AND status='sl_hit')    AS short_sl,
        COUNT(*) FILTER (WHERE trigger_timeframe='1m')                   AS tf_1m,
        COUNT(*) FILTER (WHERE trigger_timeframe='5m')                   AS tf_5m,
        COUNT(*) FILTER (WHERE tie_break)                                AS tie_breaks,
        ROUND(AVG(confluence_score)*100, 1)                              AS avg_confluence,
        ROUND(AVG(
          EXTRACT(EPOCH FROM (resolved_at - signal_created_at))/60
        ) FILTER (WHERE status = 'tp_hit'), 1)                            AS avg_min_to_tp,
        ROUND(AVG(
          EXTRACT(EPOCH FROM (resolved_at - signal_created_at))/60
        ) FILTER (WHERE status = 'sl_hit'), 1)                            AS avg_min_to_sl,
        ROUND(
          COUNT(*) FILTER (WHERE status = 'timeout')::numeric
          / NULLIF(COUNT(*) FILTER (WHERE status IN ('tp_hit','sl_hit','timeout')), 0) * 100
        , 1)                                                              AS timeout_rate,
        -- Faz 0.4/0.5 (B4/B5 düzeltmesi): avg_sim_r artık avg_r ile AYNI status
        -- kümesinde hesaplanıyor (+ sim_pnl_r IS NOT NULL). Önceden sadece
        -- sim_pnl_r IS NOT NULL filtresi vardı — status filtresi yoktu, bu da
        -- avg_r'den tamamen farklı, dönemsel çarpık bir alt örneklem üretiyordu.
        -- sim_n: bu alt örneklemin GERÇEK boyutu — CI hesabı bunu kullanmalı,
        -- resolved_n/timeout toplamını DEĞİL (önceden panel CI'yi ~2.7× dar
        -- hesaplıyordu).
        ROUND(AVG(sim_pnl_r) FILTER (WHERE status IN ('tp_hit','sl_hit','timeout') AND sim_pnl_r IS NOT NULL), 4) AS avg_sim_r,
        COUNT(*) FILTER (WHERE status IN ('tp_hit','sl_hit','timeout') AND sim_pnl_r IS NOT NULL) AS sim_n
      FROM base
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
        -- Faz 0.4 düzeltmesi: getSignalStats ile aynı kohort (bkz. yukarıdaki not)
        ROUND(AVG(o.sim_pnl_r) FILTER (WHERE o.status IN ('tp_hit','sl_hit','timeout') AND o.sim_pnl_r IS NOT NULL), 4) AS avg_sim_r,
        COUNT(*) FILTER (WHERE o.status IN ('tp_hit','sl_hit','timeout') AND o.sim_pnl_r IS NOT NULL) AS sim_n
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
    // outcome_id panelden gerçek dolum girebilmek için şart (POST /outcomes/:id/real-fill).
    // sim_entry_price + real_entry_price birlikte dönüyor ki panel "model ne dedi,
    // gerçekte ne oldu" karşılaştırmasını gösterebilsin (Faz 1 — kayma doğrulaması).
    const sql = `
      SELECT s.id, s.symbol, s.direction, s.trigger_timeframe, s.entry_price, s.stop_price,
             s.target_price, s.rr_ratio, s.confluence_score, s.indicators_snapshot, s.created_at,
             o.id AS outcome_id, o.status, o.sim_entry_price,
             o.real_entry_price, o.real_exit_price, o.real_entry_at
      FROM signals s
      LEFT JOIN signal_outcomes o ON o.signal_id = s.id
      ORDER BY s.created_at DESC
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
    recordRealFill,
    resolveOutcome,
    getSignalStats,
    getTopSymbolStats,
    getStatsBreakdown,
    getRecentSignals,
  };
}
