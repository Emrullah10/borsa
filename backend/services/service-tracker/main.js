import loadConfig from '@borsa-bot/config';
import { createDatasources } from '@borsa-bot/datasource';
import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { createServiceDiscovery } from '@borsa-bot/service-discovery';
import appConfigSchema from './configs/app-config.js';
import { evaluateOutcome } from './src/tracker.js';
import { getPendingOutcomes, resolveOutcome } from '../service-signal-engine/src/signal-repository.js';

async function initialize() {
  const config = loadConfig(appConfigSchema);

  await createDatasources(config).catch(helper.exitOnError);

  const sd = createServiceDiscovery(
    datasources.discoveryRedis,
    'service-tracker',
    { port: config.port, version: '1.0.0' },
  );
  await sd.register();
  sd.startHeartbeat();

  const timeoutMs = config.timeoutHours * 60 * 60 * 1000;

  // pendingBySymbol: { BTCUSDT: [ outcome, ... ] }
  let pendingBySymbol = {};
  // Çözümlenen outcome_id'leri tut — refresh sırasında tekrar yüklenmesini önler
  const resolvedIds = new Set();

  async function refreshPending() {
    try {
      const rows = await getPendingOutcomes();
      pendingBySymbol = {};
      for (const row of rows) {
        if (resolvedIds.has(row.outcome_id)) continue; // zaten çözümlendi, atla
        if (!pendingBySymbol[row.symbol]) pendingBySymbol[row.symbol] = [];
        pendingBySymbol[row.symbol].push(row);
      }
      helper.log.debug(`Tracker: ${rows.length} açık outcome yüklendi`);
    } catch (err) {
      helper.log.error('Tracker refresh error:', err.message);
    }
  }

  await refreshPending();
  setInterval(refreshPending, config.refreshIntervalSec * 1000);

  // md.*.1m kanallarını dinle → her 1m kapanışta o sembolün outcome'larını kontrol et
  const subRedis = datasources.coreRedis.duplicate();
  await subRedis.psubscribe('md.*.1m');

  subRedis.on('pmessage', async (_pattern, _channel, raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type !== 'candle') return;

      const { symbol, data } = msg;
      const outcomes = pendingBySymbol[symbol];
      if (!outcomes?.length) return;

      const now = Date.now();
      // Mum OHLC ilet — evaluateOutcome intra-candle high/low kullanır
      const candle = { open: data.open, high: data.high, low: data.low, close: data.close };

      for (const outcome of outcomes) {
        // Çift işlem koruması: zaten işleniyorsa atla
        if (resolvedIds.has(outcome.outcome_id)) continue;

        const result = evaluateOutcome(outcome, candle, now, timeoutMs);
        if (!result) continue;

        // Önce Set'e ekle — paralel candle mesajları aynı outcome'ı işlemesin
        resolvedIds.add(outcome.outcome_id);

        // Bellekten hemen kaldır
        pendingBySymbol[symbol] = pendingBySymbol[symbol].filter(
          o => o.outcome_id !== outcome.outcome_id,
        );

        await resolveOutcome(outcome.outcome_id, result);

        helper.log.info(
          `📊 OUTCOME: ${symbol} ${outcome.direction.toUpperCase()}` +
          ` → ${result.status.toUpperCase()} | exit:${result.exitPrice} | R:${result.pnlR}`,
        );

        await datasources.coreRedis.publish(
          'signals.resolved',
          JSON.stringify({ outcomeId: outcome.outcome_id, signalId: outcome.signal_id, symbol, ...result }),
        );
      }
    } catch (err) {
      helper.log.error('Tracker pmessage error:', err.message);
    }
  });

  helper.log.info(`Service ready — port: ${config.port}, timeout: ${config.timeoutHours}h`);
  helper.log.info('md.*.1m kanalı dinleniyor...');
}

initialize().catch(helper.exitOnError);
