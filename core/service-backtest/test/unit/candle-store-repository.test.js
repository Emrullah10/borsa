import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeCandleStoreRepository } from '../../src/infrastructure/persistence/repositories/candle-store-repository.js';

// Faz 1.5 (kalıcı mum deposu): candles tablosuna upsert + okuma. Backtest/sweep
// artık her çalıştırmada Bitget REST'ten sıfırdan çekmek yerine buradan okuyabilir —
// hızlı, tekrarlanabilir, ve ML eğitim seti için tarihsel veri biriktirir.
describe('candle-store-repository', () => {
  let db;
  let repo;

  beforeEach(() => {
    db = { query: vi.fn() };
    repo = makeCandleStoreRepository({ db });
  });

  describe('upsertCandles', () => {
    it('boş dizi verilirse hiç sorgu atmaz', async () => {
      await repo.upsertCandles('BTCUSDT', '1m', []);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('mumları (symbol, tf, ts) üzerinde ON CONFLICT DO UPDATE ile upsert eder', async () => {
      db.query.mockResolvedValue({ rows: [] });
      const candles = [
        { timestamp: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
        { timestamp: 2000, open: 1.5, high: 2.5, low: 1, close: 2, volume: 120 },
      ];
      await repo.upsertCandles('BTCUSDT', '1m', candles);

      expect(db.query).toHaveBeenCalledOnce();
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO candles');
      expect(sql).toContain('ON CONFLICT');
      expect(sql).toContain('DO UPDATE');
      // symbol, tf sabit + her mum için 6 değer (ts,open,high,low,close,volume) → tek batch INSERT
      expect(params).toContain('BTCUSDT');
      expect(params).toContain('1m');
      expect(params).toContain(1000);
      expect(params).toContain(2000);
    });

    it('tek seferde büyük miktarda mum (>1000) parçalara bölünerek yazılır (parametre limiti koruması)', async () => {
      db.query.mockResolvedValue({ rows: [] });
      const candles = Array.from({ length: 2500 }, (_, i) => ({
        timestamp: i, open: 1, high: 1, low: 1, close: 1, volume: 1,
      }));
      await repo.upsertCandles('BTCUSDT', '1m', candles);
      // 2500 mum, batch boyutu <=1000 varsayımıyla en az 3 sorgu beklenir
      expect(db.query.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('getCandles', () => {
    it('symbol+tf için artan ts sırasıyla okur', async () => {
      db.query.mockResolvedValue({ rows: [] });
      await repo.getCandles('BTCUSDT', '1m');
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('FROM candles');
      expect(sql).toMatch(/ORDER BY ts ASC/);
      expect(params).toEqual(['BTCUSDT', '1m']);
    });

    it('fromTs/toTs verilirse WHERE aralığı ekler', async () => {
      db.query.mockResolvedValue({ rows: [] });
      await repo.getCandles('BTCUSDT', '1m', { fromTs: 1000, toTs: 2000 });
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toMatch(/ts >= \$3/);
      expect(sql).toMatch(/ts <= \$4/);
      expect(params).toEqual(['BTCUSDT', '1m', 1000, 2000]);
    });

    it('DB satırlarını fetchCandles ile aynı şekle (timestamp/open/high/low/close/volume, sayısal) dönüştürür', async () => {
      db.query.mockResolvedValue({
        rows: [{ ts: '1000', open: '1.5', high: '2.5', low: '1.0', close: '2.0', volume: '100.5' }],
      });
      const result = await repo.getCandles('BTCUSDT', '1m');
      expect(result).toEqual([
        { timestamp: 1000, open: 1.5, high: 2.5, low: 1.0, close: 2.0, volume: 100.5 },
      ]);
    });
  });

  describe('getCoverage', () => {
    it('symbol+tf için min/max ts ve satır sayısını döner', async () => {
      db.query.mockResolvedValue({ rows: [{ min_ts: '1000', max_ts: '5000', n: '42' }] });
      const result = await repo.getCoverage('BTCUSDT', '1m');
      expect(result).toEqual({ minTs: 1000, maxTs: 5000, count: 42 });
    });

    it('veri yoksa null alanlarla döner', async () => {
      db.query.mockResolvedValue({ rows: [{ min_ts: null, max_ts: null, n: '0' }] });
      const result = await repo.getCoverage('BTCUSDT', '1m');
      expect(result).toEqual({ minTs: null, maxTs: null, count: 0 });
    });
  });
});
