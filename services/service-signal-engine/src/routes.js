export function registerRoutes(app, { signalRepo, processCandle }) {
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'service-signal-engine' }));

  app.get('/regime', (_req, res) => {
    res.json({ regime: processCandle.getCurrentRegime(), updatedAt: new Date().toISOString() });
  });

  app.get('/stats', async (_req, res) => {
    try {
      const [stats, topSymbols] = await Promise.all([
        signalRepo.getSignalStats(),
        signalRepo.getTopSymbolStats(),
      ]);
      res.json({ stats, topSymbols });
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
}
