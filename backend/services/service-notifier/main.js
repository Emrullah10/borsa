import loadConfig from '@borsa-bot/config';
import { createDatasources } from '@borsa-bot/datasource';
import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { createServiceDiscovery } from '@borsa-bot/service-discovery';
import appConfigSchema from './configs/app-config.js';
import { initMailer, sendSignalEmail } from './src/mailer.js';
import { formatEmailSubject, formatEmailHtml } from './src/formatter.js';

async function initialize() {
  const config = loadConfig(appConfigSchema);

  await createDatasources(config).catch(helper.exitOnError);

  const sd = createServiceDiscovery(
    datasources.discoveryRedis,
    'service-notifier',
    { port: config.port, version: '1.0.0' },
  );
  await sd.register();
  sd.startHeartbeat();

  // E-posta gönderimi şimdilik kapalı (kutu doluyor). Açmak için bu bloğun ve
  // aşağıdaki sendSignalEmail çağrısının yorumunu kaldır.
  // if (config.gmailUser && config.gmailAppPassword && config.emailTo) {
  //   initMailer(config.gmailUser, config.gmailAppPassword, config.emailTo);
  //   helper.log.info(`E-posta notifier aktif → ${config.emailTo}`);
  // } else {
  //   helper.log.warn('GMAIL_USER / GMAIL_APP_PASSWORD / EMAIL_TO tanımlı değil — e-posta devre dışı');
  // }
  helper.log.warn('E-posta gönderimi devre dışı (main.js içinde yoruma alındı)');
  void initMailer;

  const sub = datasources.coreRedis.duplicate();
  await sub.subscribe('signals.new');

  sub.on('message', async (_channel, raw) => {
    try {
      const signal = JSON.parse(raw);
      const subject = formatEmailSubject(signal);
      const html = formatEmailHtml(signal);
      // E-posta gönderimi şimdilik devre dışı (kutu doluyor). Tekrar açmak için
      // alttaki satırın yorumunu kaldır.
      // await sendSignalEmail(subject, html);
      void subject; void html; void sendSignalEmail;
    } catch (err) {
      helper.log.error('Notifier message error:', err.message);
    }
  });

  helper.log.info(`Service ready — port: ${config.port}, env: ${config.nodeEnv}`);
  helper.log.info('signals.new kanalı dinleniyor...');
}

initialize().catch(helper.exitOnError);
