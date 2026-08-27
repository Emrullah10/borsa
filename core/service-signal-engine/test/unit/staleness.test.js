import { describe, it, expect } from 'vitest';
import { isCandleStale, MAX_CANDLE_AGE_MS } from '../../src/domain/staleness.js';

describe('isCandleStale', () => {
  // 2026-08-26: signal-engine ~10 SAAT bayat mumlarla sinyal üretti.
  // ONGUSDT entry_price=0.09261 kaydedildi ama gerçek Bitget fiyatı 0.1070'ti
  // (%13 sapma) — göstergeler de (ema9/vwap) o bayat seviyeye göre hesaplanmıştı.
  // Hiçbir yerde "bu mum ne kadar eski" kontrolü yoktu, bu yüzden sessizce sürdü.

  const now = 1_787_731_620_000;

  it('taze mum (30sn önce) bayat DEĞİL', () => {
    expect(isCandleStale({ ts: now - 30_000, tf: '1m', now })).toBe(false);
  });

  it('1m için 10 dakikalık mum BAYAT', () => {
    expect(isCandleStale({ ts: now - 10 * 60_000, tf: '1m', now })).toBe(true);
  });

  it('5m mum 6 dakika sonra hâlâ taze (tf toleransı)', () => {
    expect(isCandleStale({ ts: now - 6 * 60_000, tf: '5m', now })).toBe(false);
  });

  it('5m için 30 dakikalık mum BAYAT', () => {
    expect(isCandleStale({ ts: now - 30 * 60_000, tf: '5m', now })).toBe(true);
  });

  it('gerçek olay: 10 saat bayat mum kesinlikle BAYAT', () => {
    expect(isCandleStale({ ts: now - 10.4 * 3600_000, tf: '5m', now })).toBe(true);
  });

  it('ts yoksa bayat sayılır (güvenli taraf)', () => {
    expect(isCandleStale({ ts: null, tf: '1m', now })).toBe(true);
    expect(isCandleStale({ ts: undefined, tf: '5m', now })).toBe(true);
  });

  it('bilinmeyen tf için varsayılan eşik kullanılır', () => {
    expect(isCandleStale({ ts: now - 1000, tf: '3m', now })).toBe(false);
    expect(isCandleStale({ ts: now - 60 * 60_000, tf: '3m', now })).toBe(true);
  });

  it('MAX_CANDLE_AGE_MS tf başına tanımlı', () => {
    expect(MAX_CANDLE_AGE_MS['1m']).toBeGreaterThan(0);
    expect(MAX_CANDLE_AGE_MS['5m']).toBeGreaterThan(MAX_CANDLE_AGE_MS['1m']);
  });
});
