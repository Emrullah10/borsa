export function makePublisher({ redis, candleRepo }) {
  async function publishCandle(symbol, tf, candle) {
    const channel = `md.${symbol}.${tf}`;
    const payload = JSON.stringify({ type: 'candle', symbol, tf, data: candle });
    await redis.publish(channel, payload);
    await candleRepo.pushCandle(symbol, tf, candle);
  }

  async function publishFunding(symbol, funding) {
    const channel = `md.${symbol}.funding`;
    const payload = JSON.stringify({ type: 'funding', symbol, data: funding });
    await redis.publish(channel, payload);
  }

  async function publishOI(symbol, oi) {
    const channel = `md.${symbol}.oi`;
    const payload = JSON.stringify({ type: 'oi', symbol, data: oi });
    await redis.publish(channel, payload);
  }

  async function publishLongShortRatio(symbol, ratio) {
    const channel = `md.${symbol}.lsr`;
    const payload = JSON.stringify({ type: 'lsr', symbol, data: ratio });
    await redis.publish(channel, payload);
  }

  return { publishCandle, publishFunding, publishOI, publishLongShortRatio };
}
