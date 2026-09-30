import { describe, it, expect } from 'vitest';
import { PERIODS, periodOf } from '../../../src/domain/lab/periods.js';

// Dönemler ÖNCEDEN sabit (spec 2026-09-30) — sonuçlara bakıp değiştirilemez.
describe('PERIODS', () => {
  it('train [2024-05-01, 2025-07-01)', () => {
    expect(PERIODS.train.start).toBe(Date.UTC(2024, 4, 1));
    expect(PERIODS.train.end).toBe(Date.UTC(2025, 6, 1));
  });
  it('validation [2025-07-01, 2026-01-01)', () => {
    expect(PERIODS.validation.start).toBe(Date.UTC(2025, 6, 1));
    expect(PERIODS.validation.end).toBe(Date.UTC(2026, 0, 1));
  });
  it('holdout [2026-01-01, 2026-10-01)', () => {
    expect(PERIODS.holdout.start).toBe(Date.UTC(2026, 0, 1));
    expect(PERIODS.holdout.end).toBe(Date.UTC(2026, 9, 1));
  });
  it('dönemler bitişik ve çakışmaz', () => {
    expect(PERIODS.train.end).toBe(PERIODS.validation.start);
    expect(PERIODS.validation.end).toBe(PERIODS.holdout.start);
  });
});

describe('periodOf', () => {
  it('sınırlar: başlangıç DAHİL, bitiş HARİÇ (sızıntı olmasın)', () => {
    expect(periodOf(Date.UTC(2025, 6, 1))).toBe('validation');
    expect(periodOf(Date.UTC(2025, 6, 1) - 1)).toBe('train');
    expect(periodOf(Date.UTC(2026, 0, 1))).toBe('holdout');
    expect(periodOf(Date.UTC(2026, 0, 1) - 1)).toBe('validation');
  });
  it('aralık dışı → null', () => {
    expect(periodOf(Date.UTC(2024, 3, 30))).toBeNull();
    expect(periodOf(Date.UTC(2026, 9, 1))).toBeNull();
  });
});
