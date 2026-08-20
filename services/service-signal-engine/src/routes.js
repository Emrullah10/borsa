import { parseDays, parseBreakdownQuery } from './parse-stats-query.js';

export function registerRoutes(app, { signalRepo, processCandle }) {
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'service-signal-engine' }));

  app.get('/regime', (_req, res) => {
    res.json({ regime: processCandle.getCurrentRegime(), updatedAt: new Date().toISOString() });
  });

  app.get('/stats', async (req, res) => {
    const { days, error } = parseDays(req.query.days);
    if (error) return res.status(400).json({ error });
    try {
      const [stats, topSymbols] = await Promise.all([
        signalRepo.getSignalStats(days),
        signalRepo.getTopSymbolStats(days),
      ]);
      res.json({ stats, topSymbols });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/stats/breakdown', async (req, res) => {
    const { by, days, error } = parseBreakdownQuery(req.query);
    if (error) return res.status(400).json({ error });
    try {
      const breakdown = await signalRepo.getStatsBreakdown({ by, days });
      res.json({ by, days, breakdown });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/signals', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 100);
      const rows = await signalRepo.getRecentSignals(limit);
      const signals = rows.map((r) => ({
        id: r.id,
        symbol: r.symbol,
        direction: r.direction,
        triggerTimeframe: r.trigger_timeframe,
        entryPrice: parseFloat(r.entry_price),
        stopPrice: parseFloat(r.stop_price),
        targetPrice: parseFloat(r.target_price),
        rrRatio: parseFloat(r.rr_ratio),
        confluenceScore: parseFloat(r.confluence_score),
        indicatorsSnapshot: r.indicators_snapshot,
        createdAt: r.created_at,
      }));
      res.json({ signals });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Faz 3 execution doğrulama (borsa-strategy-validation-plan): gerçek dolum
  // fiyatını kaydeder — istatistiksel edge kanıtı için değil, slippage
  // modelinin (sim_entry_price) gerçekle ne kadar uyuştuğunu ölçmek için.
  app.post('/outcomes/:id/real-fill', async (req, res) => {
    const { realEntryPrice, realExitPrice, realEntryAt, notes } = req.body ?? {};
    if (realEntryPrice == null && realExitPrice == null) {
      return res.status(400).json({ error: 'realEntryPrice veya realExitPrice gerekli' });
    }
    try {
      await signalRepo.recordRealFill(req.params.id, { realEntryPrice, realExitPrice, realEntryAt, notes });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
