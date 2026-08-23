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

  const { rows: configRows } = await datasources.postgres.query(
    "SELECT key, value FROM bot_config WHERE key IN ('taker_fee','slippage_pct','exit_slippage_pct')"
  );
  const cfg = Object.fromEntries(configRows.map(r => [r.key, r.value]));
  const fees = {
    takerFee: parseFloat(cfg.taker_fee ?? 0.0006),
    slippagePct: parseFloat(cfg.slippage_pct ?? 0.0003),
    // Çıkış kayması: stop-through gerçeği. Modellenmezse ölçülen edge yukarı sapar.
    exitSlippagePct: parseFloat(cfg.exit_slippage_pct ?? 0.0003),
  };

  const { processOutcomeCandle } = buildContainer({ timeoutMs, fees });

  await processOutcomeCandle.refreshPending();
  setInterval(() => processOutcomeCandle.refreshPending(), config.refreshIntervalSec * 1000);

  // md.*.1m kanallarını dinle → her 1m kapanışta o sembolün outcome'larını kontrol et
  // enableReadyCheck:false — subscribe-mode bağlantıda INFO komutu reddedilir,
  // ready-check kapatılmazsa her reconnect'te "Unhandled error event" oluşur.
  const subRedis = datasources.coreRedis.duplicate({ enableReadyCheck: false });
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
