import { describe, it, expect } from 'vitest';
import { RULES, judgeValidation, judgeHoldout, assessExamSanity } from '../../../src/domain/lab/verdict.js';

// Kurallar ÖNCEDEN kayıtlı (spec 2026-09-30) — testler onları sabitler ki sonuca bakıp gevşetilemesin.
describe('RULES (önceden kayıtlı)', () => {
  it('4 aile, Bonferroni %98.75, maliyet stresi ×2, Tip 1 için n≥100, rastgele yüzdelik ≥ %95', () => {
    expect(RULES.families).toHaveLength(4);
    expect(RULES.ciLevel).toBeCloseTo(1 - 0.05 / 4, 10);
    expect(RULES.costStressMultiplier).toBe(2);
    expect(RULES.minTradesTip1).toBe(100);
    expect(RULES.randomPercentileMin).toBe(0.95);
    expect(RULES.randomTrials).toBe(200);
  });
  it('dondurulmuş: sonradan değiştirilemez', () => expect(Object.isFrozen(RULES)).toBe(true));
});

describe('judgeValidation (holdout kapısı)', () => {
  it('doğrulama ortalaması > 0 → holdout açılabilir', () => expect(judgeValidation({ mean: 0.02, n: 300 }).passed).toBe(true));
  it('≤ 0 → holdout AÇILMAZ', () => {
    const v = judgeValidation({ mean: -0.01, n: 300 });
    expect(v.passed).toBe(false); expect(v.reason).toMatch(/holdout/i);
  });
  it('örneklem yoksa geçmez', () => expect(judgeValidation({ mean: 0.5, n: 0 }).passed).toBe(false));
});

const GOOD = { ci: { mean: 0.1, low: 0.02, high: 0.18, n: 150 }, stressMean: 0.05, randomPercentile: 0.99, nTrades: 150 };

describe('judgeHoldout', () => {
  it('tüm koşullar sağlanınca GEÇTİ', () => {
    const v = judgeHoldout({ tip: 'tip1', ...GOOD });
    expect(v.passed).toBe(true);
    expect(v.checks.every((c) => c.passed)).toBe(true);
  });
  it('CI alt sınırı ≤ 0 → KALDI ve nedeni söyler', () => {
    const v = judgeHoldout({ tip: 'tip1', ...GOOD, ci: { ...GOOD.ci, low: -0.01 } });
    expect(v.passed).toBe(false);
    expect(v.checks.find((c) => c.name === 'ciLowPositive').passed).toBe(false);
  });
  it('maliyet ×2 iken ortalama ≤ 0 → KALDI', () => {
    expect(judgeHoldout({ tip: 'tip1', ...GOOD, stressMean: -0.001 }).passed).toBe(false);
  });
  it('rastgele %95\'ini geçemezse KALDI', () => {
    expect(judgeHoldout({ tip: 'tip1', ...GOOD, randomPercentile: 0.90 }).passed).toBe(false);
  });
  it('Tip 1\'de n < 100 → KALDI, Tip 2\'de bu koşul aranmaz', () => {
    expect(judgeHoldout({ tip: 'tip1', ...GOOD, nTrades: 99 }).passed).toBe(false);
    expect(judgeHoldout({ tip: 'tip2', ...GOOD, nTrades: 99 }).passed).toBe(true);
  });
  it('her kontrol Türkçe açıklama taşır', () => {
    const v = judgeHoldout({ tip: 'tip1', ...GOOD });
    for (const c of v.checks) expect(c.detail).toMatch(/[a-zA-ZçğıöşüÇĞİÖŞÜ]/);
  });
});

describe('assessExamSanity (sınavın kendisi bozuk mu?)', () => {
  it('rastgele stratejinin ortalama CI alt sınırı > 0 → sınav BOZUK', () => {
    const s = assessExamSanity({ randomMeanCI: { mean: 0.03, low: 0.01, high: 0.05 } });
    expect(s.sane).toBe(false); expect(s.detail).toMatch(/bozuk/i);
  });
  it('rastgele strateji ≤ 0 (maliyetten dolayı kaybeder) → sınav sağlam', () => {
    expect(assessExamSanity({ randomMeanCI: { mean: -0.05, low: -0.08, high: -0.02 } }).sane).toBe(true);
  });
  it('CI aralığı 0\'ı kapsıyorsa (gürültü) sağlam sayılır', () => {
    expect(assessExamSanity({ randomMeanCI: { mean: 0.0, low: -0.02, high: 0.02 } }).sane).toBe(true);
  });
});
