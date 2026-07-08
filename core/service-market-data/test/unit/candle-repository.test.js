import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeCandleRepository } from '../../src/infrastructure/persistence/repositories/candle-repository.js';

describe('candle-repository', () => {
  let redis;
  let repo;

  beforeEach(() => {
    redis = {
      lpush: vi.fn().mockResolvedValue(1),
      ltrim: vi.fn().mockResolvedValue('OK'),
      lrange: vi.fn(),
    };
    repo = makeCandleRepository({ redis });
  });

  it('pushCandle: lpush + ltrim çağırır', async () => {
    const candle = { ts: 1000, open: 100, high: 105, low: 99, close: 103, volume: 50 };
    await repo.pushCandle('BTCUSDT', '1m', candle);
    expect(redis.lpush).toHaveBeenCalledWith('candles:BTCUSDT:1m', JSON.stringify(candle));
    expect(redis.ltrim).toHaveBeenCalledWith('candles:BTCUSDT:1m', 0, 59);
  });

  it('getCandles: lrange çağırır ve parse eder, reversed döner', async () => {
    const c1 = { ts: 2000, open: 102, high: 107, low: 101, close: 105, volume: 60 };
    const c2 = { ts: 1000, open: 100, high: 105, low: 99, close: 103, volume: 50 };
    redis.lrange.mockResolvedValue([JSON.stringify(c1), JSON.stringify(c2)]);
    const result = await repo.getCandles('BTCUSDT', '1m', 60);
    expect(redis.lrange).toHaveBeenCalledWith('candles:BTCUSDT:1m', 0, 59);
    // reversed: eskiden yeniye
    expect(result[0]).toEqual(c2);
    expect(result[1]).toEqual(c1);
  });

  it('getLastPrice: son mumun close fiyatını döner', async () => {
    const candle = { ts: 1000, open: 100, high: 105, low: 99, close: 103, volume: 50 };
    redis.lrange.mockResolvedValue([JSON.stringify(candle)]);
    const price = await repo.getLastPrice('BTCUSDT');
    expect(price).toBe(103);
  });

  it('getLastPrice: boş cache → null döner', async () => {
    redis.lrange.mockResolvedValue([]);
    const price = await repo.getLastPrice('BTCUSDT');
    expect(price).toBeNull();
  });
});
