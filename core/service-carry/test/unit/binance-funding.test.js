import { describe, it, expect, vi } from 'vitest';
import { fetchBinanceFundingHistory, binanceSymbolCandidates } from '../../src/infrastructure/binance-funding.js';

describe('fetchBinanceFundingHistory', () => {
  const rows = (startTs, n) => Array.from({ length: n }, (_, i) => ({
    symbol: 'BTCUSDT', fundingTime: startTs + i * 8 * 3600_000, fundingRate: '0.00010000', markPrice: '1',
  }));
  const okJson = (data) => ({ ok: true, status: 200, json: async () => data });

  it('1000\'lik sayfalarda startTime\'ı son kayıt+1\'e ilerleterek çeker', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(okJson(rows(1_600_000_000_000, 1000)))
      .mockResolvedValueOnce(okJson(rows(1_600_000_000_000 + 1000 * 8 * 3600_000, 200)));
    const out = await fetchBinanceFundingHistory('BTCUSDT', { fromMs: 1_600_000_000_000, toMs: 2_000_000_000_000, fetchImpl, sleepMs: 0 });
    expect(out).toHaveLength(1200);
    const secondUrl = String(fetchImpl.mock.calls[1][0]);
    const lastOfFirst = 1_600_000_000_000 + 999 * 8 * 3600_000;
    expect(secondUrl).toContain(`startTime=${lastOfFirst + 1}`);
    expect(secondUrl).toContain('symbol=BTCUSDT');
    expect(out[0]).toMatchObject({ rate: 0.0001 });
  });

  it('toMs\'ten sonraki kayıtları döndürmez', async () => {
    const start = 1_600_000_000_000;
    const fetchImpl = vi.fn().mockResolvedValueOnce(okJson(rows(start, 10)));
    const out = await fetchBinanceFundingHistory('BTCUSDT', { fromMs: start, toMs: start + 3 * 8 * 3600_000, fetchImpl, sleepMs: 0 });
    expect(out.every((r) => r.timestamp <= start + 3 * 8 * 3600_000)).toBe(true);
    expect(out).toHaveLength(4);
  });

  it('geçersiz sembol (HTTP 400) → [] döner, throw etmez', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ code: -1121, msg: 'Invalid symbol.' }) });
    await expect(fetchBinanceFundingHistory('NOPEUSDT', { fromMs: 0, toMs: 1, fetchImpl, sleepMs: 0 })).resolves.toEqual([]);
  });

  it('ağ hatasında throw etmez, elindeki kısmi veriyi döner', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(okJson(rows(1_600_000_000_000, 1000)))
      .mockRejectedValueOnce(new Error('ECONNRESET'));
    const out = await fetchBinanceFundingHistory('BTCUSDT', { fromMs: 1_600_000_000_000, toMs: 2_000_000_000_000, fetchImpl, sleepMs: 0 });
    expect(out).toHaveLength(1000);
  });
});

describe('binanceSymbolCandidates', () => {
  it('önce aynı isim, sonra 1000x öneki (Binance PEPE/BONK/SHIB için 1000 çarpanlı kontrat kullanır)', () => {
    expect(binanceSymbolCandidates('PEPEUSDT')).toEqual(['PEPEUSDT', '1000PEPEUSDT']);
  });
});

