import loadConfig from '@borsa-bot/config';
import { createDatasources } from '@borsa-bot/datasource';
import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { createServiceDiscovery } from '@borsa-bot/service-discovery';
import appConfigSchema from '../configs/app-config.js';
import { buildContainer } from './container.js';

export async function boot() {
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
  const { processOutcomeCandle } = buildContainer({ timeoutMs });

  await processOutcomeCandle.refreshPending();
  setInterval(() => processOutcomeCandle.refreshPending(), config.refreshIntervalSec * 1000);

  // md.*.1m kanallarını dinle → her 1m kapanışta o sembolün outcome'larını kontrol et
  const subRedis = datasources.coreRedis.duplicate();
  await subRedis.psubscribe('md.*.1m');

  subRedis.on('pmessage', async (_pattern, _channel, raw) => {
    try {
      const msg = JSON.parse(raw);
      await processOutcomeCandle.handleCandleMessage(msg);
    } catch (err) {
      helper.log.error('Tracker pmessage error:', err.message);
    }
  });

  helper.log.info(`Service ready — port: ${config.port}, timeout: ${config.timeoutHours}h`);
  helper.log.info('md.*.1m kanalı dinleniyor...');
}
