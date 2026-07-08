import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchCandles, fetchPrice } from './marketApi.js';

describe('marketApi', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => vi.restoreAllMocks());

  it('fetchCandles: GET /candles/BTCUSDT çağırır', async () => {
    const fakeCandles = [{ ts: 1000, open: 100, high: 105, low: 99, close: 103, volume: 10 }];
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ candles: fakeCandles }) });
    const result = await fetchCandles('BTCUSDT', '1m', 60);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/candles/BTCUSDT'));
    expect(result).toEqual(fakeCandles);
  });

  it('fetchPrice: number döner', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ symbol: 'BTCUSDT', price: 78420 }) });
    const result = await fetchPrice('BTCUSDT');
    expect(result).toBe(78420);
  });

  it('hata durumunda fetchCandles boş dizi döner', async () => {
    global.fetch.mockRejectedValue(new Error('fail'));
    expect(await fetchCandles('BTCUSDT')).toEqual([]);
  });
});
