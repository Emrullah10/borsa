const MAX_CANDLES = 60;

export function makeCandleRepository({ redis }) {
  async function pushCandle(symbol, tf, candle) {
    const key = `candles:${symbol}:${tf}`;
    await redis.lpush(key, JSON.stringify(candle));
    await redis.ltrim(key, 0, MAX_CANDLES - 1);
  }

  async function getCandles(symbol, tf, limit = MAX_CANDLES) {
    const key = `candles:${symbol}:${tf}`;
    const raw = await redis.lrange(key, 0, limit - 1);
    return raw.map((s) => JSON.parse(s)).reverse(); // eskiden yeniye
  }

  async function getLastPrice(symbol) {
    const raw = await redis.lrange(`candles:${symbol}:1m`, 0, 0);
    if (!raw.length) return null;
    return JSON.parse(raw[0]).close;
  }

  return { pushCandle, getCandles, getLastPrice };
}
