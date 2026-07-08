import datasources from '@borsa-bot/datasource';

const MAX_CANDLES = 60;

export async function pushCandle(symbol, tf, candle) {
  const key = `candles:${symbol}:${tf}`;
  await datasources.coreRedis.lpush(key, JSON.stringify(candle));
  await datasources.coreRedis.ltrim(key, 0, MAX_CANDLES - 1);
}

export async function getCandles(symbol, tf, limit = MAX_CANDLES) {
  const key = `candles:${symbol}:${tf}`;
  const raw = await datasources.coreRedis.lrange(key, 0, limit - 1);
  return raw.map((s) => JSON.parse(s)).reverse(); // eskiden yeniye
}

export async function getLastPrice(symbol) {
  const raw = await datasources.coreRedis.lrange(`candles:${symbol}:1m`, 0, 0);
  if (!raw.length) return null;
  return JSON.parse(raw[0]).close;
}
