import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCandlesCached } from '../../src/infrastructure/cached-fetcher.js';

// Faz 1.5 (kalıcı mum deposu): sweep/backtest artık her çalıştırmada Bitget
// REST'ten sıfırdan çekmek zorunda değil. fetchCandlesCached, candles tablosunda
// istenen [now-days, now] aralığını YETERİNCE kapsayan veri varsa oradan okur;
// yoksa REST'ten çeker ve sonucu tabloya yazar (bir sonraki çalıştırma hızlanır).
describe('fetchCandlesCached', () => {
  let repo;
  let fetchFromRest;

  beforeEach(() => {
    repo = {
      getCoverage: vi.fn(),
      getCandles: vi.fn(),
      upsertCandles: vi.fn().mockResolvedValue(undefined),
    };
    fetchFromRest = vi.fn();
  });

  it('DB kapsamı istenen aralığı tam kapsıyorsa REST\'e hiç gitmez, DB\'den okur', async () => {
    const now = 1_700_000_000_000;
    const days = 30;
    const rangeStartMs = now - days * 86_400_000;
    repo.getCoverage.mockResolvedValue({ minTs: rangeStartMs - 60_000, maxTs: now, count: 1000 });
    const dbCandles = [{ timestamp: rangeStartMs, open: 1, high: 1, low: 1, close: 1, volume: 1 }];
    repo.getCandles.mockResolvedValue(dbCandles);

    const result = await fetchCandlesCached({ repo, fetchFromRest, symbol: 'BTCUSDT', tf: '1m', days, now });

    expect(fetchFromRest).not.toHaveBeenCalled();
    expect(repo.upsertCandles).not.toHaveBeenCalled();
    expect(result).toBe(dbCandles);
  });

  it('DB kapsamı YOKSA (coverage null) REST\'ten çeker ve DB\'ye yazar', async () => {
    repo.getCoverage.mockResolvedValue({ minTs: null, maxTs: null, count: 0 });
    const restCandles = [{ timestamp: 1000, open: 1, high: 1, low: 1, close: 1, volume: 1 }];
    fetchFromRest.mockResolvedValue(restCandles);

    const result = await fetchCandlesCached({ repo, fetchFromRest, symbol: 'BTCUSDT', tf: '1m', days: 30 });

    expect(fetchFromRest).toHaveBeenCalledWith('BTCUSDT', '1m', 30);
    expect(repo.upsertCandles).toHaveBeenCalledWith('BTCUSDT', '1m', restCandles);
    expect(result).toBe(restCandles);
  });

  it('DB kapsamı KISMENSE (minTs istenen aralıktan sonra başlıyor) REST\'ten çeker', async () => {
    const now = 1_700_000_000_000;
    const days = 30;
    const rangeStartMs = now - days * 86_400_000;
    // DB sadece son 5 günü kapsıyor — 30 günlük istek karşılanamaz
    repo.getCoverage.mockResolvedValue({ minTs: now - 5 * 86_400_000, maxTs: now, count: 100 });
    const restCandles = [{ timestamp: rangeStartMs, open: 1, high: 1, low: 1, close: 1, volume: 1 }];
    fetchFromRest.mockResolvedValue(restCandles);

    const result = await fetchCandlesCached({ repo, fetchFromRest, symbol: 'BTCUSDT', tf: '1m', days, now });

    expect(fetchFromRest).toHaveBeenCalledOnce();
    expect(repo.upsertCandles).toHaveBeenCalledWith('BTCUSDT', '1m', restCandles);
    expect(result).toBe(restCandles);
  });

  it('repo verilmezse (DB yok) doğrudan REST\'e gider, upsert denemez', async () => {
    const restCandles = [{ timestamp: 1000, open: 1, high: 1, low: 1, close: 1, volume: 1 }];
    fetchFromRest.mockResolvedValue(restCandles);

    const result = await fetchCandlesCached({ repo: null, fetchFromRest, symbol: 'BTCUSDT', tf: '1m', days: 30 });

    expect(fetchFromRest).toHaveBeenCalledOnce();
    expect(result).toBe(restCandles);
  });

  it('DB okuma sırasında hata olursa REST\'e düşer (fail-safe)', async () => {
    repo.getCoverage.mockRejectedValue(new Error('DB kapalı'));
    const restCandles = [{ timestamp: 1000, open: 1, high: 1, low: 1, close: 1, volume: 1 }];
    fetchFromRest.mockResolvedValue(restCandles);

    const result = await fetchCandlesCached({ repo, fetchFromRest, symbol: 'BTCUSDT', tf: '1m', days: 30 });

    expect(fetchFromRest).toHaveBeenCalledOnce();
    expect(result).toBe(restCandles);
  });
});
