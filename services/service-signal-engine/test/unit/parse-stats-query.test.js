import { describe, it, expect } from 'vitest';
import { parseDays, parseBreakdownQuery } from '../../src/parse-stats-query.js';

describe('parseDays', () => {
  it('undefined ise varsayılan 7 döner', () => {
    expect(parseDays(undefined)).toEqual({ days: 7, error: null });
  });

  it('geçerli sayısal string doğru parse edilir', () => {
    expect(parseDays('14')).toEqual({ days: 14, error: null });
  });

  it('1den küçük değer hata döner', () => {
    expect(parseDays('0').error).toBeTruthy();
  });

  it('90dan büyük değer hata döner', () => {
    expect(parseDays('91').error).toBeTruthy();
  });

  it('sayısal olmayan değer hata döner', () => {
    expect(parseDays('abc').error).toBeTruthy();
  });
});

describe('parseBreakdownQuery', () => {
  it('geçerli by=regime + days kabul eder', () => {
    expect(parseBreakdownQuery({ by: 'regime', days: '14' })).toEqual({ by: 'regime', days: 14 });
  });

  it('geçersiz by değeri hata döner', () => {
    const result = parseBreakdownQuery({ by: 'symbol', days: '7' });
    expect(result.error).toBeTruthy();
  });

  it('SQL injection denemesi hata döner (whitelist dışı)', () => {
    const result = parseBreakdownQuery({ by: "regime'; DROP TABLE signals; --", days: '7' });
    expect(result.error).toBeTruthy();
  });

  it('days verilmezse varsayılan 7 kullanır', () => {
    expect(parseBreakdownQuery({ by: 'tf' })).toEqual({ by: 'tf', days: 7 });
  });
});
