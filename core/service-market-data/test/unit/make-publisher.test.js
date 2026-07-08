import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makePublisher } from '../../src/application/use-cases/make-publisher.js';

describe('make-publisher', () => {
  let redis;
  let candleRepo;
  let publisher;

  beforeEach(() => {
    redis = { publish: vi.fn().mockResolvedValue(1) };
    candleRepo = { pushCandle: vi.fn().mockResolvedValue(undefined) };
    publisher = makePublisher({ redis, candleRepo });
  });

  it('publishes candle to correct channel: md.{symbol}.{tf} and stores it', async () => {
    const candle = { open: 1, high: 2, low: 0.9, close: 1.5, volume: 100, ts: 1000 };
    await publisher.publishCandle('BTCUSDT', '1m', candle);

    expect(redis.publish).toHaveBeenCalledWith(
      'md.BTCUSDT.1m',
      JSON.stringify({ type: 'candle', symbol: 'BTCUSDT', tf: '1m', data: candle }),
    );
    expect(candleRepo.pushCandle).toHaveBeenCalledWith('BTCUSDT', '1m', candle);
  });

  it('publishes funding to md.{symbol}.funding', async () => {
    await publisher.publishFunding('BTCUSDT', { rate: 0.0001, nextTs: 9999 });
    expect(redis.publish).toHaveBeenCalledWith(
      'md.BTCUSDT.funding',
      expect.stringContaining('"type":"funding"'),
    );
  });

  it('publishes OI to md.{symbol}.oi', async () => {
    await publisher.publishOI('BTCUSDT', { oi: 50000, oiDelta: 500 });
    expect(redis.publish).toHaveBeenCalledWith(
      'md.BTCUSDT.oi',
      expect.stringContaining('"type":"oi"'),
    );
  });

  it('publishes LSR to md.{symbol}.lsr', async () => {
    await publisher.publishLongShortRatio('BTCUSDT', { longRatio: 0.6, shortRatio: 0.4 });
    expect(redis.publish).toHaveBeenCalledWith(
      'md.BTCUSDT.lsr',
      expect.stringContaining('"type":"lsr"'),
    );
  });
});
