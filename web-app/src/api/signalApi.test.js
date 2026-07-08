import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSignals } from './signalApi.js';

describe('fetchSignals', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => vi.restoreAllMocks());

  it('GET /signals çağırır ve signals dizisi döner', async () => {
    const fakeSignals = [{ id: 1, symbol: 'BTCUSDT', direction: 'long' }];
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ signals: fakeSignals }) });
    const result = await fetchSignals(20);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/signals?limit=20'));
    expect(result).toEqual(fakeSignals);
  });

  it('fetch hatası durumunda boş dizi döner', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));
    const result = await fetchSignals(20);
    expect(result).toEqual([]);
  });
});
