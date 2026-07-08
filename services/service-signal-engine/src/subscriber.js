import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';

export async function startSubscriber({ processCandle, onSignal }) {
  const subRedis = datasources.coreRedis.duplicate();

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
