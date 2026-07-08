import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';

export async function startSubscriber({ processCandle, onSignal }) {
  // enableReadyCheck:false — ioredis normalde her (re)bağlantıda sunucunun
  // hazır olup olmadığını INFO komutuyla kontrol eder. Bu bağlantı
  // psubscribe'a girdikten sonra Redis, subscribe-mode kısıtlaması gereği
  // INFO'yu reddeder ("only (P|S)SUBSCRIBE ... allowed"), bu da her
  // reconnect'te "Unhandled error event" + gereksiz retry döngüsüne yol
  // açar. Ready-check'i kapatmak bu subscribe-only bağlantı için güvenli.
  const subRedis = datasources.coreRedis.duplicate({ enableReadyCheck: false });

  const { rows: watchlist } = await datasources.postgres.query(
    'SELECT symbol, timeframes FROM watchlist WHERE active = true'
  );

  // Tüm coin'leri otomatik izle: watchlist tablosuna bağlı kalmak yerine
  // market-data'nın yayınladığı her 'md.*' kanalını pattern-subscribe ile yakala.
  // Böylece MARKET_DATA_SYMBOLS ne olursa olsun (ALL/liste) signal-engine ona uyar.
  // (watchlist tablosu yalnızca log/uyumluluk için okunuyor.)
  if (watchlist.length > 0) {
    helper.log.info(`watchlist tablosunda ${watchlist.length} kayıt var (bilgi amaçlı; pattern-subscribe kullanılıyor)`);
  }

  await subRedis.psubscribe('md.*');
  helper.log.info('Signal engine pattern-subscribed: md.* (tüm coin\'ler)');

  subRedis.on('pmessage', async (_pattern, channel, raw) => {
    try {
      const msg = JSON.parse(raw);
      await processCandle.handleMessage(channel, msg, { onSignal });
    } catch (err) {
      helper.log.error('Subscriber message error:', err.message);
    }
  });
}
