import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@borsa-bot/datasource', () => ({
  default: {
    coreRedis: {
      lpush: vi.fn().mockResolvedValue(1),
      ltrim: vi.fn().mockResolvedValue('OK'),
      lrange: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { createPublisher } from '../../src/publisher.js';

describe('publisher', () => {
  let fakeRedis;
  let publisher;

  beforeEach(() => {
    fakeRedis = { publish: vi.fn().mockResolvedValue(1) };
    publisher = createPublisher(fakeRedis);
  });

  it('publishes candle to correct channel: md.{symbol}.{tf}', async () => {
    const candle = { open: 1, high: 2, low: 0.9, close: 1.5, volume: 100, ts: 1000 };
    await publisher.publishCandle('BTCUSDT', '1m', candle);

    expect(fakeRedis.publish).toHaveBeenCalledWith(
      'md.BTCUSDT.1m',
      JSON.stringify({ type: 'candle', symbol: 'BTCUSDT', tf: '1m', data: candle }),
    );
  });

  it('publishes funding to md.{symbol}.funding', async () => {
    await publisher.publishFunding('BTCUSDT', { rate: 0.0001, nextTs: 9999 });
    expect(fakeRedis.publish).toHaveBeenCalledWith(
      'md.BTCUSDT.funding',
      expect.stringContaining('"type":"funding"'),
    );
  });

  it('publishes OI to md.{symbol}.oi', async () => {
    await publisher.publishOI('BTCUSDT', { oi: 50000, oiDelta: 500 });
    expect(fakeRedis.publish).toHaveBeenCalledWith(
      'md.BTCUSDT.oi',
      expect.stringContaining('"type":"oi"'),
    );
  });

  it('publishes LSR to md.{symbol}.lsr', async () => {
    await publisher.publishLongShortRatio('BTCUSDT', { longRatio: 0.6, shortRatio: 0.4 });
    expect(fakeRedis.publish).toHaveBeenCalledWith(
      'md.BTCUSDT.lsr',
      expect.stringContaining('"type":"lsr"'),
    );
  });
});
