import { describe, it, expect } from 'vitest';
import { carryDayOf, bucketFundingByCarryDay, trailingApr, DAY_MS } from '../../src/domain/funding-buckets.js';

const D = Date.UTC(2026, 9, 10); // 2026-10-10 00:00 UTC

describe('carryDayOf', () => {
  it('d 00:00 ödemesi bir önceki taşıma gününe aittir (karar ondan hemen sonra)', () => {
    expect(carryDayOf(D)).toBe(D - DAY_MS);
  });

  it('Binance ms kayması (00:00:00.003) da önceki güne düşer', () => {
    expect(carryDayOf(D + 3)).toBe(D - DAY_MS);
  });

  it('08:00 ve 16:00 ödemeleri aynı güne aittir', () => {
    expect(carryDayOf(D + 8 * 3_600_000)).toBe(D);
    expect(carryDayOf(D + 16 * 3_600_000 + 2)).toBe(D);
  });
});

describe('bucketFundingByCarryDay + trailingApr', () => {
  const series = [];
  for (let k = 0; k < 20; k++) {
    for (const h of [8, 16, 24]) series.push({ timestamp: D + k * DAY_MS + h * 3_600_000, rate: 0.0001 });
  }
  const buckets = bucketFundingByCarryDay(series);

  it('günde 3 ödeme × 0.0001 → gün toplamı 0.0003', () => {
    expect(buckets.get(D)).toBeCloseTo(0.0003, 10);
  });

  it('trailingApr = ortalama günlük × 365, yalnız ÖNCEKİ günler', () => {
    expect(trailingApr(buckets, D + 14 * DAY_MS, 14)).toBeCloseTo(0.0003 * 365, 10);
  });

  it('pencerede eksik gün varsa null (yeni listelenen coin sıralamaya girmez)', () => {
    expect(trailingApr(buckets, D + 5 * DAY_MS, 14)).toBeNull();
  });

  it('karar günü d\'nin kendi funding\'i pencereye GİRMEZ (look-ahead yok)', () => {
    const spiky = new Map(buckets);
    const d = D + 15 * DAY_MS;
    spiky.set(d, 1); // d gününde dev ödeme
    expect(trailingApr(spiky, d, 14)).toBeCloseTo(trailingApr(buckets, d, 14), 12);
  });
});
