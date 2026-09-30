import { describe, it, expect } from 'vitest';
import { buildForwardReport } from '../../../src/domain/lab/forward-report.js';

const DAY = 86_400_000;
const START = Date.UTC(2026, 9, 1);
const meta = { generatedAt: '2026-11-20T00:00:00.000Z', forwardStart: START, now: Date.UTC(2026, 10, 20) };
const waiting = { key: 'F1_momentum', title: 'F1 momentum', status: 'yetersiz', n: 50, needed: 90, mean: 0.0009, firstDay: START, lastDay: START + 49 * DAY, holdout: null, checks: [] };

describe('buildForwardReport', () => {
  it('yetersiz veri: ilerlemeyi gösterir ve ERKEN KARAR vermez', () => {
    const md = buildForwardReport({ ...meta, results: [waiting] });
    expect(md).toMatch(/50\/90/);
    expect(md).toMatch(/erken karar/i);
    expect(md).toMatch(/kalan 40 gün/i);
    expect(md).not.toMatch(/GEÇTİ/);
  });
  it('henüz ileri dönem başlamadıysa bunu söyler', () => {
    const md = buildForwardReport({ ...meta, now: START, results: [{ ...waiting, n: 0, mean: 0, firstDay: null, lastDay: null }] });
    expect(md).toMatch(/henüz ileri dönem verisi yok/i);
  });
  it('geçen aday: GEÇTİ ve kontrol satırları', () => {
    const r = { ...waiting, status: 'geçti', n: 120, checks: [{ name: 'ciLowPositive', passed: true, detail: 'Alt sınır pozitif' }] };
    const md = buildForwardReport({ ...meta, results: [r] });
    expect(md).toMatch(/GEÇTİ/); expect(md).toContain('Alt sınır pozitif');
    expect(md).toMatch(/canlıya almadan önce/i);
  });
  it('kalan aday: KALDI ve nedenleri', () => {
    const r = { ...waiting, status: 'kaldı', n: 120, checks: [{ name: 'ciLowPositive', passed: false, detail: 'Alt sınır negatif' }] };
    const md = buildForwardReport({ ...meta, results: [r] });
    expect(md).toMatch(/KALDI/); expect(md).toContain('Alt sınır negatif');
  });
  it('dondurulmuş kuralları ve para riski olmadığını hatırlatır', () => {
    const md = buildForwardReport({ ...meta, results: [waiting] });
    expect(md).toMatch(/dondurulmuş/i); expect(md).toMatch(/kâğıt üstü/i);
  });
  it('geçen gün sayısını yazar', () => expect(buildForwardReport({ ...meta, results: [waiting] })).toMatch(/50 gün/));
});
