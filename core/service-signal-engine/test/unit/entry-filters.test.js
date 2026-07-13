import { describe, it, expect } from 'vitest';
import { applyEntryFilters, DEFAULT_FILTER_PARAMS } from '../../src/domain/entry-filters.js';

const baseParams = DEFAULT_FILTER_PARAMS;

describe('applyEntryFilters — aşırı-uzama (overextension)', () => {
  it('LONG: bb.pb eşiği aşarsa reddeder', () => {
    const r = applyEntryFilters({
      direction: 'long',
      indicators: { bb: { pb: 0.95 }, rsi: 55, adx: 30 },
      params: baseParams,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('overextension');
  });

  it('LONG: bb.pb eşik altındaysa izin verir', () => {
    const r = applyEntryFilters({
      direction: 'long',
      indicators: { bb: { pb: 0.7 }, rsi: 55, adx: 30 },
      params: baseParams,
    });
    expect(r.allowed).toBe(true);
  });

  it('LONG: rsi eşiği aşarsa reddeder', () => {
    const r = applyEntryFilters({
      direction: 'long',
      indicators: { bb: { pb: 0.7 }, rsi: 75, adx: 30 },
      params: baseParams,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('overextension');
  });

  it('SHORT: bb.pb eşiğin altındaysa reddeder', () => {
    const r = applyEntryFilters({
      direction: 'short',
      indicators: { bb: { pb: 0.05 }, rsi: 35, adx: 30 },
      params: baseParams,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('overextension');
  });

  it('SHORT: rsi eşiğin altındaysa reddeder', () => {
    const r = applyEntryFilters({
      direction: 'short',
      indicators: { bb: { pb: 0.3 }, rsi: 25, adx: 30 },
      params: baseParams,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('overextension');
  });

  it('SHORT: eşikler içindeyse izin verir', () => {
    const r = applyEntryFilters({
      direction: 'short',
      indicators: { bb: { pb: 0.3 }, rsi: 35, adx: 30 },
      params: baseParams,
    });
    expect(r.allowed).toBe(true);
  });
});

describe('applyEntryFilters — ADX tükenme tavanı', () => {
  it('ADX tavanı aşarsa yön farketmeksizin reddeder', () => {
    const r = applyEntryFilters({
      direction: 'long',
      indicators: { bb: { pb: 0.5 }, rsi: 55, adx: 80 },
      params: baseParams,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('adx-exhaustion');
  });

  it('ADX tavan altındaysa izin verir', () => {
    const r = applyEntryFilters({
      direction: 'long',
      indicators: { bb: { pb: 0.5 }, rsi: 55, adx: 50 },
      params: baseParams,
    });
    expect(r.allowed).toBe(true);
  });
});

describe('applyEntryFilters — eksik gösterge (null-tolerant)', () => {
  it('bb null ise overextension gate atlanır', () => {
    const r = applyEntryFilters({
      direction: 'long',
      indicators: { bb: null, rsi: 55, adx: 30 },
      params: baseParams,
    });
    expect(r.allowed).toBe(true);
  });

  it('rsi null ise overextension gate atlanır', () => {
    const r = applyEntryFilters({
      direction: 'long',
      indicators: { bb: { pb: 0.5 }, rsi: null, adx: 30 },
      params: baseParams,
    });
    expect(r.allowed).toBe(true);
  });

  it('adx null ise adx gate atlanır', () => {
    const r = applyEntryFilters({
      direction: 'long',
      indicators: { bb: { pb: 0.5 }, rsi: 55, adx: null },
      params: baseParams,
    });
    expect(r.allowed).toBe(true);
  });

  it('tüm göstergeler null ise izin verir (davranış-koruma)', () => {
    const r = applyEntryFilters({
      direction: 'long',
      indicators: {},
      params: baseParams,
    });
    expect(r.allowed).toBe(true);
  });
});

describe('applyEntryFilters — params eksikse default kullanır', () => {
  it('params geçilmezse DEFAULT_FILTER_PARAMS kullanılır', () => {
    const r = applyEntryFilters({
      direction: 'long',
      indicators: { bb: { pb: 0.95 }, rsi: 55, adx: 30 },
    });
    expect(r.allowed).toBe(false);
  });
});
