import express from 'express';
import loadConfig from '@borsa-bot/config';
import { createDatasources } from '@borsa-bot/datasource';
import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { createServiceDiscovery } from '@borsa-bot/service-discovery';
import appConfigSchema from './configs/app-config.js';
import { startBitgetWS } from './src/bitget-ws.js';
import { getCandles, getLastPrice } from './src/candle-store.js';

async function initialize() {
  const config = loadConfig(appConfigSchema);
  const app = express();
  app.use((_req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); next(); });

  await createDatasources(config).catch((err) => {
    helper.exitOnError(err);
  });

  const sd = createServiceDiscovery(
    datasources.discoveryRedis,
    'service-market-data',
    { port: config.port, version: '1.0.0' },
  );
  await sd.register();
  sd.startHeartbeat();

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'service-market-data' }));

  app.get('/candles/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      const tf = req.query.timeframe ?? '1m';
      const limit = Math.min(parseInt(req.query.limit ?? '60', 10), 200);
      const candles = await getCandles(symbol, tf, limit);
      res.json({ symbol, tf, candles });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/price/:symbol', async (req, res) => {
    try {
      const price = await getLastPrice(req.params.symbol);
      res.json({ symbol: req.params.symbol, price });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(config.port, () => helper.appStarted(config));

  await startBitgetWS();
}

initialize().catch(helper.exitOnError);
