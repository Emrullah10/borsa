import loadConfig from '@borsa-bot/config';
import { createDatasources } from '@borsa-bot/datasource';
import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { createServiceDiscovery } from '@borsa-bot/service-discovery';
import { formatEmailSubject, formatEmailHtml } from '@borsa-bot/core-notifier/src/domain/formatter.js';
import { formatTelegramMessage } from '@borsa-bot/core-notifier/src/domain/telegram-formatter.js';
import { makeTelegramSender } from '@borsa-bot/core-notifier/src/infrastructure/telegram-sender.js';
import appConfigSchema from '../configs/app-config.js';
import { buildContainer } from './container.js';

export async function boot() {
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
  // let mailer;
  // if (config.gmailUser && config.gmailAppPassword && config.emailTo) {
  //   mailer = buildContainer({ gmailUser: config.gmailUser, gmailAppPassword: config.gmailAppPassword }).mailer;
  //   helper.log.info(`E-posta notifier aktif → ${config.emailTo}`);
  // } else {
  //   helper.log.warn('GMAIL_USER / GMAIL_APP_PASSWORD / EMAIL_TO tanımlı değil — e-posta devre dışı');
  // }
  helper.log.warn('E-posta gönderimi devre dışı (main.js içinde yoruma alındı)');
  void buildContainer;

  // Telegram — e-posta kutu doldurduğu için kapatılmıştı, bu yüzden şu an
  // çalışan hiçbir bildirim kanalı yoktu. 5m sinyal ~10dk geçerli; sinyali
  // zamanında göremezsen geç giriyorsun ve kayma büyüyor (Faz 1).
  const telegram = makeTelegramSender({
    botToken: config.telegramBotToken,
    chatId: config.telegramChatId,
    log: helper.log,
  });
  if (telegram.enabled) {
    helper.log.info('Telegram bildirimi aktif');
  } else {
    helper.log.warn('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID tanımlı değil — Telegram devre dışı');
  }

  // enableReadyCheck:false — subscribe-mode bağlantıda INFO komutu reddedilir,
  // ready-check kapatılmazsa her reconnect'te "Unhandled error event" oluşur.
  const sub = datasources.coreRedis.duplicate({ enableReadyCheck: false });
  await sub.subscribe('signals.new');

  sub.on('message', async (_channel, raw) => {
    try {
      const signal = JSON.parse(raw);
      const subject = formatEmailSubject(signal);
      const html = formatEmailHtml(signal);
      // E-posta gönderimi şimdilik devre dışı (kutu doluyor). Tekrar açmak için
      // alttaki satırın yorumunu kaldır.
      // await mailer.sendSignalEmail(subject, html, config.emailTo);
      void subject; void html;

      await telegram.send(formatTelegramMessage(signal));
    } catch (err) {
      helper.log.error('Notifier message error:', err.message);
    }
  });

  helper.log.info(`Service ready — port: ${config.port}, env: ${config.nodeEnv}`);
  helper.log.info('signals.new kanalı dinleniyor...');
}
