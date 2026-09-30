import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 2026-09-30: fetchCandles sayfalamada `endTime = oldest - 1` kullanıyordu. Bitget endTime'ı
// "mumun KAPANIŞ zamanı <= endTime" diye yorumluyor (ölçüldü: 1Dutc endTime=07-01 23:59:59.999 → son mum
// 06-30, 07-01 ATLANIYOR). Sonuç: her sayfa sınırında TAM 1 MUM kayıp (1d: 90'da 1, 1h/5m: 200'de 1) —
// tüm zaman dilimlerinde, tüm backtest verisinde. Bu sahte sunucu API'nin gerçek davranışını taklit eder.
const { histMock } = vi.hoisted(() => ({ histMock: vi.fn() }));
vi.mock('bitget-api', () => ({ RestClientV2: vi.fn().mockImplementation(() => ({ getFuturesHistoricCandles: histMock })) }));

import { fetchCandles } from '../../src/infrastructure/fetcher.js';

const PERIOD = { '5m': 300_000, '1H': 3_600_000, '1Dutc': 86_400_000 };
const NOW = Date.UTC(2026, 8, 30, 12, 34, 56); // rastgele bir an

// Bitget davranışı: kapanışı (ts+period) <= endTime olan mumlardan EN YENİ `min(limit,pageMax)` tanesi.
function fakeBitget(granularity, { pageMax }) {
  const p = PERIOD[granularity];
  const newest = Math.floor(NOW / p) * p - p; // son KAPANMIŞ mum
  const store = Array.from({ length: 5000 }, (_, k) => newest - k * p); // ts'ler, yeniden eskiye
  histMock.mockImplementation(async ({ endTime, limit }) => {
    const rows = store.filter((ts) => ts + p <= Number(endTime)).slice(0, Math.min(Number(limit), pageMax));
    return { data: rows.map((ts) => [String(ts), '1', '2', '0.5', '1.5', '10', '15']) };
  });
  return { p, newest };
}

describe('fetchCandles — sayfa sınırında mum KAYBI yok', () => {
  // Yalnız Date sahtelenir: fetcher'ın sleep()'i gerçek setTimeout kullanır (hepsini sahtelersek test kilitlenir).
  beforeEach(() => { histMock.mockReset(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
  afterEach(() => vi.useRealTimers());

  for (const [g, pageMax, days] of [['1H', 200, 60], ['1Dutc', 90, 500], ['5m', 200, 10]]) {
    it(`${g} (sayfa ${pageMax}): ${days} günlük çekim kesintisiz ardışık`, async () => {
      const { p } = fakeBitget(g, { pageMax });
      const candles = await fetchCandles('BTCUSDT', g, days);
      expect(candles.length).toBeGreaterThan((days * 86_400_000) / p - 1);
      for (let i = 1; i < candles.length; i++) {
        expect(candles[i].timestamp - candles[i - 1].timestamp).toBe(p); // boşluk = kayıp mum
      }
    });
  }

  it('sonuçta kopya yok', async () => {
    fakeBitget('1H', { pageMax: 200 });
    const c = await fetchCandles('BTCUSDT', '1H', 30);
    expect(new Set(c.map((x) => x.timestamp)).size).toBe(c.length);
  });

  it('API endTime\'ı yok sayıp hep aynı sayfayı dönerse sonsuz döngüye girmez', async () => {
    histMock.mockResolvedValue({ data: [['1000000', '1', '2', '0.5', '1.5', '10', '15'], ['1003600', '1', '2', '0.5', '1.5', '10', '15']] });
    // startMs'in çok gerisinde kalınca bile durmalı
    vi.setSystemTime(2_000_000_000);
    const c = await fetchCandles('BTCUSDT', '1H', 365);
    expect(histMock.mock.calls.length).toBeLessThan(5);
    expect(c.length).toBeGreaterThan(0);
  });
});
