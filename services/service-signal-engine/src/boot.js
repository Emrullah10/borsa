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
  app.use(express.json()); // Faz 3 execution doğrulama: POST /outcomes/:id/real-fill
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
    `SELECT key, value FROM bot_config WHERE key IN (
      'confluence_threshold','rr_min','taker_fee','atr_stop_mult','target_rr',
      'require_sr_cap','adx_max','max_pb_long','min_pb_short','rsi_max_long','rsi_min_short'
    )`
  );
  const cfg = Object.fromEntries(configRows.map(r => [r.key, r.value]));
  const confluenceThreshold = parseFloat(cfg.confluence_threshold ?? 0.65);
  const takerFee = parseFloat(cfg.taker_fee ?? 0.0006);
  const atrStopMult = cfg.atr_stop_mult != null ? parseFloat(cfg.atr_stop_mult) : undefined;
  const targetRR = cfg.target_rr != null ? parseFloat(cfg.target_rr) : undefined;
  const requireSrCap = cfg.require_sr_cap === true || cfg.require_sr_cap === 'true';
  const filterParams = {
    adxMax: parseFloat(cfg.adx_max ?? 65),
    maxPbLong: parseFloat(cfg.max_pb_long ?? 0.85),
    minPbShort: parseFloat(cfg.min_pb_short ?? 0.15),
    rsiMaxLong: parseFloat(cfg.rsi_max_long ?? 70),
    rsiMinShort: parseFloat(cfg.rsi_min_short ?? 30),
  };

  const container = await buildContainer({
    confluenceThreshold, takerFee, filterParams, requireSrCap, atrStopMult, targetRR,
  });

  const wsServer = createWsServer();
  wsServer.attach(httpServer);

  registerRoutes(app, container);

  httpServer.listen(config.port, () => helper.appStarted(config));

  await startSubscriber({
    processCandle: container.processCandle,
    onSignal: (signal) => wsServer.broadcast({ type: 'signal', data: signal }),
  });
}
