import { describe, it, expect, vi, beforeEach } from 'vitest';

// Lab (2026-09-30): fetchFundingHistory sayfalama yapmıyordu — sadece son ~33 günü
// çekiyordu (pageSize=100). Ayrıca Bitget funding geçmişini yalnız ~90 gün saklıyor;
// Binance yıllarca geriye veriyor, sinyal geçmişi oradan gelecek.
const { getFundingMock, getTickersMock, getContractsMock } = vi.hoisted(() => ({
  getFundingMock: vi.fn(), getTickersMock: vi.fn(), getContractsMock: vi.fn(),
}));
vi.mock('bitget-api', () => ({
  RestClientV2: vi.fn().mockImplementation(() => ({ getFuturesHistoricFundingRates: getFundingMock, getFuturesAllTickers: getTickersMock, getFuturesContractConfig: getContractsMock })),
}));

import {
  fetchFundingHistory, fetchBinanceFundingHistory, binanceSymbolCandidates, fetchLiquidUniverse, fetchCryptoSymbolSet,
} from '../../src/infrastructure/fetcher.js';

const page = (startTs, n, stepMs = 8 * 3600_000) =>
  Array.from({ length: n }, (_, i) => ({ fundingTime: String(startTs + i * stepMs), fundingRate: '0.0001' }));

describe('fetchFundingHistory (Bitget) — sayfalama', () => {
  beforeEach(() => getFundingMock.mockReset());

  it('sayfa doluyken (100) sonraki sayfayı ister, kısa sayfada durur', async () => {
    getFundingMock
      .mockResolvedValueOnce({ data: page(1_000_000_000_000, 100) })
      .mockResolvedValueOnce({ data: page(2_000_000_000_000, 100) })
      .mockResolvedValueOnce({ data: page(3_000_000_000_000, 30) });
    const out = await fetchFundingHistory('BTCUSDT');
    expect(out).toHaveLength(230);
    expect(getFundingMock.mock.calls.map((c) => c[0].pageNo)).toEqual(['1', '2', '3']);
  });

  it('sonuç eski → yeni sıralıdır', async () => {
    getFundingMock.mockResolvedValueOnce({ data: [...page(2_000_000_000_000, 3)].reverse() });
    const out = await fetchFundingHistory('BTCUSDT');
    expect(out[0].timestamp).toBeLessThan(out[1].timestamp);
    expect(out[0]).toMatchObject({ rate: 0.0001 });
  });

  it('API pageNo\'yu yok sayıp aynı sayfayı dönerse sonsuz döngüye girmez', async () => {
    getFundingMock.mockResolvedValue({ data: page(1_000_000_000_000, 100) });
    const out = await fetchFundingHistory('BTCUSDT');
    expect(out).toHaveLength(100);
    expect(getFundingMock.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('2. sayfada hata olursa 1. sayfadaki veriyi kaybetmez (kısmi döner)', async () => {
    getFundingMock
      .mockResolvedValueOnce({ data: page(1_000_000_000_000, 100) })
      .mockRejectedValueOnce(new Error('boom'));
    const out = await fetchFundingHistory('BTCUSDT');
    expect(out).toHaveLength(100);
  });

  it('ilk sayfada hata → boş dizi (eski davranış), throw yok', async () => {
    getFundingMock.mockRejectedValueOnce(new Error('Bad Request'));
    await expect(fetchFundingHistory('DELISTEDUSDT')).resolves.toEqual([]);
  });
});

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

// 2026-09-30: Bitget'in 804 kontratının 339'u RWA (hisse/ETF/emtia; isRwa=YES) — ör. KORUUSDT bir ETF,
// SNDK/MSTR hisse, XAU altın. 7/24 kripto gibi davranmazlar (hafta sonu boşluğu, farklı funding);
// kripto stratejisi evrenine girmemeli.
describe('fetchLiquidUniverse', () => {
  const tickers = { data: [
    { symbol: 'SMALLUSDT', usdtVolume: '900000' },
    { symbol: 'BTCUSDT', usdtVolume: '2000000000' },
    { symbol: 'MIDUSDT', usdtVolume: '7000000' },
    { symbol: 'STOCKUSDT', usdtVolume: '50000000' },
    { symbol: 'DELISTUSDT', usdtVolume: '9000000' },
    { symbol: 'NOVOLUSDT' },
  ] };
  const contracts = { data: [
    { symbol: 'SMALLUSDT', isRwa: 'NO', symbolStatus: 'normal' },
    { symbol: 'BTCUSDT', isRwa: 'NO', symbolStatus: 'normal' },
    { symbol: 'MIDUSDT', isRwa: 'NO', symbolStatus: 'normal' },
    { symbol: 'STOCKUSDT', isRwa: 'YES', symbolStatus: 'normal' },
    { symbol: 'DELISTUSDT', isRwa: 'NO', symbolStatus: 'off' },
    { symbol: 'NOVOLUSDT', isRwa: 'NO', symbolStatus: 'normal' },
  ] };
  beforeEach(() => { getTickersMock.mockReset(); getContractsMock.mockReset(); });

  it('hacim eşiği altını, RWA\'yı ve normal olmayan durumu eler; hacme göre azalan sıralar', async () => {
    getTickersMock.mockResolvedValueOnce(tickers); getContractsMock.mockResolvedValueOnce(contracts);
    expect(await fetchLiquidUniverse({ minVolumeUsdt: 5_000_000 })).toEqual(['BTCUSDT', 'MIDUSDT']);
  });

  it('excludeRwa:false ile RWA dahil edilir', async () => {
    getTickersMock.mockResolvedValueOnce(tickers); getContractsMock.mockResolvedValueOnce(contracts);
    expect(await fetchLiquidUniverse({ minVolumeUsdt: 5_000_000, excludeRwa: false })).toEqual(['BTCUSDT', 'STOCKUSDT', 'MIDUSDT']);
  });

  it('sözleşme bilgisi olmayan sembol (bilinmeyen) temkinli davranıp elenir', async () => {
    getTickersMock.mockResolvedValueOnce({ data: [{ symbol: 'GHOSTUSDT', usdtVolume: '99000000' }] });
    getContractsMock.mockResolvedValueOnce({ data: [] });
    expect(await fetchLiquidUniverse({ minVolumeUsdt: 1 })).toEqual([]);
  });

  it('ticker ya da sözleşme listesi alınamazsa fırlatır (sessiz boş evren YOK)', async () => {
    getTickersMock.mockRejectedValueOnce(new Error('network')); getContractsMock.mockResolvedValueOnce(contracts);
    await expect(fetchLiquidUniverse({ minVolumeUsdt: 1 })).rejects.toThrow();
  });
});

describe('fetchCryptoSymbolSet', () => {
  it('yalnız normal durumdaki, RWA olmayan semboller', async () => {
    getContractsMock.mockResolvedValueOnce({ data: [
      { symbol: 'BTCUSDT', isRwa: 'NO', symbolStatus: 'normal' },
      { symbol: 'XAUUSDT', isRwa: 'YES', symbolStatus: 'normal' },
      { symbol: 'OLDUSDT', isRwa: 'NO', symbolStatus: 'off' },
    ] });
    const set = await fetchCryptoSymbolSet();
    expect([...set]).toEqual(['BTCUSDT']);
  });
});
