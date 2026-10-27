import http from 'node:http';
import express from 'express';
import loadConfig from '@borsa-bot/config';
import { createDatasources } from '@borsa-bot/datasource';
import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { createServiceDiscovery } from '@borsa-bot/service-discovery';
import appConfigSchema from '../configs/app-config.js';
import { buildContainer } from './container.js';

const HOUR_MS = 3_600_000;
const FAIL_ALERT_AFTER = 3;

export async function boot() {
  const config = loadConfig(appConfigSchema);
  await createDatasources(config).catch(helper.exitOnError);

  const sd = createServiceDiscovery(datasources.discoveryRedis, 'service-carry', { port: config.port, version: '1.0.0' });
  await sd.register();
  sd.startHeartbeat();

  const { engine, repo, llm, telegram } = buildContainer({ config, db: datasources.postgres });
  helper.log.info(`[carry] mod=${config.mode} sermaye=$${config.capitalUsd} · AI=${llm.provider}${llm.enabled ? ` (${llm.model})` : ' KAPALI'} · Telegram=${telegram.enabled ? 'açık' : 'KAPALI'}`);

  // ── HTTP (panel) ────────────────────────────────────────────────────────────
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    next();
  });
  const route = (fn) => async (req, res) => {
    try { res.json(await fn(req)); } catch (err) {
      helper.log.error(`[carry] ${req.path}: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  };
  app.get('/health', (_req, res) => res.json({ ok: true, mode: config.mode }));
  app.get('/carry/summary', route(() => engine.buildSummary()));
  app.get('/carry/opportunities', route(() => repo.getLatestOpportunities()));
  app.get('/carry/risk-events', route(() => repo.getRiskEvents({ limit: 50 })));
  app.get('/carry/equity', route(() => repo.getDailyEquity(config.mode)));
  http.createServer(app).listen(config.port, () => helper.log.info(`[carry] HTTP :${config.port}`));

  // ── Zamanlayıcı ─────────────────────────────────────────────────────────────
  // Her tur: risk bekçisi (10 dk'da bir), funding tahsilatı (saatte bir), günlük karar (idempotent,
  // 00:00-07:54 UTC penceresinde; veri eksikse sonraki tura ertelenir). Adımlar birbirini bloklamaz.
  let busy = false;
  let lastSentinel = 0;
  let lastSettleHour = -1;
  let decisionFailures = 0;
  const step = async (name, fn) => {
    try { return await fn(); } catch (err) {
      helper.log.error(`[carry] ${name} hatası: ${err.message}`);
      return { error: err.message };
    }
  };

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const t = Date.now();
      if (t - lastSentinel >= config.sentinelIntervalMin * 60_000) {
        lastSentinel = t;
        const r = await step('risk bekçisi', () => engine.runSentinel());
        if (r?.assessed) helper.log.info(`[carry] ${r.assessed} yeni duyuru değerlendirildi, ${r.alerts} uyarı`);
      }
      const hour = Math.floor(t / HOUR_MS);
      if (hour !== lastSettleHour) {
        lastSettleHour = hour;
        await step('funding tahsilatı', () => engine.settleFunding());
      }
      const d = await step('günlük karar', () => engine.runDailyDecision());
      if (d?.error) {
        decisionFailures++;
        if (decisionFailures === FAIL_ALERT_AFTER) await telegram.send(`⚠️ <b>Taşıma botu</b>: günlük karar ${FAIL_ALERT_AFTER} kez üst üste alınamadı — ${d.error}`);
      } else if (!d?.skipped) {
        decisionFailures = 0;
      }
    } finally {
      busy = false;
    }
  }

  await tick();
  setInterval(tick, config.tickIntervalSec * 1000);
  helper.log.info(`[carry] zamanlayıcı aktif (her ${config.tickIntervalSec} sn)`);
}
