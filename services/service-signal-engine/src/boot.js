import http from 'http';
import express from 'express';
import loadConfig from '@borsa-bot/config';
import { createDatasources } from '@borsa-bot/datasource';
import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { createServiceDiscovery } from '@borsa-bot/service-discovery';
import appConfigSchema from '../configs/app-config.js';
import { buildContainer } from './container.js';
import { startSubscriber } from './subscriber.js';
import { registerRoutes } from './routes.js';
import { createWsServer } from './ws-server.js';

export async function boot() {
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

  const { rows: configRows } = await datasources.postgres.query(
    "SELECT key, value FROM bot_config WHERE key IN ('confluence_threshold','rr_min','taker_fee')"
  );
  const cfg = Object.fromEntries(configRows.map(r => [r.key, r.value]));
  const confluenceThreshold = parseFloat(cfg.confluence_threshold ?? 0.65);
  const takerFee = parseFloat(cfg.taker_fee ?? 0.0006);

  const container = await buildContainer({ confluenceThreshold, takerFee });

  const wsServer = createWsServer();
  wsServer.attach(httpServer);

  registerRoutes(app, container);

  httpServer.listen(config.port, () => helper.appStarted(config));

  await startSubscriber({
    processCandle: container.processCandle,
    onSignal: (signal) => wsServer.broadcast({ type: 'signal', data: signal }),
  });
}
