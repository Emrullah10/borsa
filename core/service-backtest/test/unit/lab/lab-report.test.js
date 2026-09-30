import { describe, it, expect } from 'vitest';
import { buildReport } from '../../../src/domain/lab/lab-report.js';

const base = {
  generatedAt: '2026-10-01T00:00:00.000Z',
  coverage: { cryptoSymbols: 89, dailyRange: '2024-04-04 → 2026-09-29', fundingBinancePct: 92, skippedNote: '3 sembol atlandı' },
  holdoutOpened: true,
  families: [
    { key: 'funding_extreme', title: 'Funding uçları (Tip 1)', config: 'z=2.5, 24s, stop 3×ATR', train: { mean: 0.05, n: 400 }, validation: { mean: 0.03, n: 200 },
      holdout: { mean: 0.01, ciLow: -0.02, ciHigh: 0.04, n: 120 }, verdict: { passed: false, checks: [{ name: 'ciLowPositive', passed: false, detail: 'Alt sınır −0.02 ≤ 0' }] } },
    { key: 'F1_momentum', title: 'F1 momentum (Tip 2)', config: 'L=14, haftalık', train: { mean: 0.001, n: 300 }, validation: { mean: -0.001, n: 180 },
      holdout: null, verdict: { passed: false, skipped: true, reason: 'Doğrulamada ≤ 0: holdout AÇILMADI' } },
  ],
};

describe('buildReport', () => {
  it('her aile için GEÇTİ/KALDI ve nedenini yazar', () => {
    const md = buildReport(base);
    expect(md).toContain('Funding uçları (Tip 1)');
    expect(md).toMatch(/KALDI/);
    expect(md).toContain('Alt sınır −0.02 ≤ 0');
  });
  it('holdout açılmayan aileyi açıkça belirtir', () => {
    expect(buildReport(base)).toMatch(/holdout AÇILMADI/);
  });
  it('hiçbiri geçmediyse bunun geçerli bir sonuç olduğunu söyler', () => {
    expect(buildReport(base)).toMatch(/hiçbir aday geçmedi/i);
  });
  it('geçen aile varsa "geçti" özetini verir', () => {
    const md = buildReport({ ...base, families: [{ ...base.families[0], verdict: { passed: true, checks: [] } }] });
    expect(md).toMatch(/GEÇTİ/);
    expect(md).not.toMatch(/hiçbir aday geçmedi/i);
  });
  it('sınırlamalar bölümü hayatta kalma yanlılığını ve vekil funding\'i içerir', () => {
    const md = buildReport(base);
    expect(md).toMatch(/hayatta kalma/i);
    expect(md).toMatch(/Binance/);
  });
  it('kapsam bilgisini yazar', () => expect(buildReport(base)).toContain('89'));
});
