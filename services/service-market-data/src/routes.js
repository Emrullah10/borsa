export function registerRoutes(app, { candleRepo }) {
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'service-market-data' }));

  app.get('/candles/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      const tf = req.query.timeframe ?? '1m';
      const limit = Math.min(parseInt(req.query.limit ?? '60', 10), 200);
      const candles = await candleRepo.getCandles(symbol, tf, limit);
      res.json({ symbol, tf, candles });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/price/:symbol', async (req, res) => {
    try {
      const price = await candleRepo.getLastPrice(req.params.symbol);
      res.json({ symbol: req.params.symbol, price });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
