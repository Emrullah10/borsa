import http from 'http';
import express from 'express';
import loadConfig from '@borsa-bot/config';
import { createDatasources } from '@borsa-bot/datasource';
import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { createServiceDiscovery } from '@borsa-bot/service-discovery';
import appConfigSchema from './configs/app-config.js';
import { startSubscriber, getCurrentRegime } from './src/subscriber.js';
import { getRecentSignals, getSignalStats, getTopSymbolStats } from './src/signal-repository.js';
import { createWsServer } from './src/ws-server.js';

async function initialize() {
  const config = loadConfig(appConfigSchema);
  const app = express();
  app.use((_req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); next(); });
  const httpServer = http.createServer(app);

  await createDatasources(config).catch(helper.exitOnError);

  const sd = createServiceDiscovery(
    datasources.discoveryRedis,
    'service-signal-engine',
    { port: config.port, version: '1.0.0' },
  );
  await sd.register();
  sd.startHeartbeat();

  const wsServer = createWsServer();
  wsServer.attach(httpServer);

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'service-signal-engine' }));

  app.get('/regime', (_req, res) => {
    res.json({ regime: getCurrentRegime(), updatedAt: new Date().toISOString() });
  });

  app.get('/stats', async (_req, res) => {
    try {
      const [stats, topSymbols] = await Promise.all([getSignalStats(), getTopSymbolStats()]);
      res.json({ stats, topSymbols });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/signals', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 100);
      const rows = await getRecentSignals(limit);
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

  httpServer.listen(config.port, () => helper.appStarted(config));

  await startSubscriber(config, (signal) => {
    wsServer.broadcast({ type: 'signal', data: signal });
  });
}

initialize().catch(helper.exitOnError);
