import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('bitget-api', () => ({
  RestClientV2: vi.fn().mockImplementation(() => ({
    getFuturesHistoricCandles: vi.fn().mockResolvedValue({
      data: [
        ['1717200000000', '67000', '67500', '66800', '67200', '100.5', '6742400'],
        ['1717200060000', '67200', '67300', '67100', '67150', '80.2', '5381890'],
      ]
    }),
    getFuturesHistoricFundingRates: vi.fn().mockResolvedValue({
      data: [
        { fundingTime: '1717200000000', fundingRate: '0.0001' },
        { fundingTime: '1717228800000', fundingRate: '0.00015' },
      ]
    }),
    getFuturesOpenInterest: vi.fn().mockResolvedValue({
      data: { openInterestList: [{ size: '50000', symbol: 'BTCUSDT' }], ts: '1717200000000' }
    }),
  }))
}));

import { fetchCandles, fetchFundingHistory, fetchOISnapshot } from '../src/fetcher.js';

describe('fetchCandles', () => {
  it('mum dizisini { timestamp, open, high, low, close, volume } formatında döner', async () => {
    const candles = await fetchCandles('BTCUSDT', '1m', 1);
    expect(candles).toHaveLength(2);
    expect(candles[0]).toMatchObject({
      timestamp: 1717200000000,
      open: 67000,
      high: 67500,
      low: 66800,
      close: 67200,
      volume: 100.5,
    });
  });

  it('mumları kronolojik sıraya (eski → yeni) dizer', async () => {
    const candles = await fetchCandles('BTCUSDT', '1m', 1);
    expect(candles[0].timestamp).toBeLessThan(candles[1].timestamp);
  });
});

describe('fetchFundingHistory', () => {
  it('{ timestamp, rate } dizisi döner', async () => {
    const funding = await fetchFundingHistory('BTCUSDT');
    expect(funding).toHaveLength(2);
    expect(funding[0]).toMatchObject({ timestamp: 1717200000000, rate: 0.0001 });
  });
});

describe('fetchOISnapshot', () => {
  it('number döner', async () => {
    const oi = await fetchOISnapshot('BTCUSDT');
    expect(typeof oi).toBe('number');
    expect(oi).toBe(50000);
  });
});
