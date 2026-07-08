import express from 'express';
import loadConfig from '@borsa-bot/config';
import { createDatasources } from '@borsa-bot/datasource';
import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { createServiceDiscovery } from '@borsa-bot/service-discovery';
import appConfigSchema from '../configs/app-config.js';
import { buildContainer } from './container.js';
import { registerRoutes } from './routes.js';
import { startBitgetWS } from './bitget-ws.js';

export async function boot() {
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

  const container = buildContainer();

  registerRoutes(app, container);

  app.listen(config.port, () => helper.appStarted(config));

  await startBitgetWS({ publisher: container.publisher });
}
