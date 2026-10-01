import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFundingStoreRepository } from '../../src/infrastructure/persistence/repositories/funding-store-repository.js';

// Lab (2026-09-30): funding geçmişi kalıcı — Bitget yalnız ~90 gün saklıyor, kaydedilmeyen
// veri kaybolur. (source, symbol, ts) anahtarı Bitget ve Binance'i yan yana tutar.
describe('funding-store-repository', () => {
  let db; let repo;
  beforeEach(() => { db = { query: vi.fn() }; repo = makeFundingStoreRepository({ db }); });

  it('boş dizi → sorgu atmaz', async () => {
    await repo.upsertFunding('binance', 'BTCUSDT', []);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('(source, symbol, ts) üzerinde ON CONFLICT DO UPDATE ile upsert eder', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await repo.upsertFunding('binance', 'BTCUSDT', [{ timestamp: 1000, rate: 0.0001 }, { timestamp: 2000, rate: -0.0002 }]);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO funding_rates');
    expect(sql).toContain('ON CONFLICT (source, symbol, ts) DO UPDATE');
    expect(params).toEqual(['binance', 'BTCUSDT', 1000, 0.0001, 'binance', 'BTCUSDT', 2000, -0.0002]);
  });

  it('5000+ kayıt parçalara bölünür (parametre limiti)', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const rows = Array.from({ length: 5000 }, (_, i) => ({ timestamp: i, rate: 0 }));
    await repo.upsertFunding('bitget', 'ETHUSDT', rows);
    expect(db.query.mock.calls.length).toBeGreaterThan(1);
    for (const [, params] of db.query.mock.calls) expect(params.length).toBeLessThan(65535);
  });

  it('getFunding: sayıya çevirir, artan ts, aralık filtreli', async () => {
    db.query.mockResolvedValue({ rows: [{ ts: '1000', rate: '0.00010000' }, { ts: '2000', rate: '-0.00020000' }] });
    const out = await repo.getFunding('binance', 'BTCUSDT', { fromTs: 500, toTs: 3000 });
    expect(out).toEqual([{ timestamp: 1000, rate: 0.0001 }, { timestamp: 2000, rate: -0.0002 }]);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY ts ASC/);
    expect(params).toEqual(['binance', 'BTCUSDT', 500, 3000]);
  });

  it('getCoverage: min/max/count', async () => {
    db.query.mockResolvedValue({ rows: [{ min_ts: '1000', max_ts: '9000', n: '42' }] });
    expect(await repo.getCoverage('bitget', 'BTCUSDT')).toEqual({ minTs: 1000, maxTs: 9000, count: 42 });
  });

  it('getCoverage: veri yoksa null', async () => {
    db.query.mockResolvedValue({ rows: [{ min_ts: null, max_ts: null, n: '0' }] });
    expect(await repo.getCoverage('bitget', 'X')).toEqual({ minTs: null, maxTs: null, count: 0 });
  });
});
