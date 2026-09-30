import { describe, it, expect } from 'vitest';
import { FORWARD, evaluateForwardF1, evaluateForwardTip1 } from '../../../src/domain/lab/lab-forward.js';
import { tip1World, tip2World } from './_worlds.js';

// İLERİ TEST: dondurulmuş adaylar yalnızca FORWARD.start (2026-10-01) sonrası veriyle değerlendirilir.
// Geçmiş holdout'a bir daha bakılmaz (F1 için yandı) — taze veri gerçek sınavdır.
const FAST = { randomTrials: 20, bootstrapIterations: 800 };
const END = Date.UTC(2027, 3, 1); // sentetik veri 2027-04-01'e kadar
const at = (y, m, d) => Date.UTC(y, m - 1, d);

describe('FORWARD (dondurulmuş kurallar)', () => {
  it('başlangıç 2026-10-01, en az 90 gün, 2 aile, Bonferroni %97.5', () => {
    expect(FORWARD.start).toBe(at(2026, 10, 1));
    expect(FORWARD.minDays).toBe(90);
    expect(FORWARD.families).toEqual(['F1_momentum', 'funding_extreme']);
    expect(FORWARD.ciLevel).toBeCloseTo(0.975, 10);
  });
  it('adaylar lab\'da seçilen AYARLARLA dondurulmuş', () => {
    expect(FORWARD.F1).toEqual({ L: 28, rebalanceEvery: 7, k: 5 });
    expect(FORWARD.tip1).toEqual({ z: 2.5, holdHours: 72, stopAtrMult: 3, minAbsRate: 0.0002 });
  });
  it('değiştirilemez (dondurulmuş)', () => {
    expect(Object.isFrozen(FORWARD)).toBe(true); expect(Object.isFrozen(FORWARD.F1)).toBe(true);
  });
});

describe('evaluateForwardF1', () => {
  const planted = tip2World({ mu: (s) => (s - 15) * 0.001, seed: 7, end: END });
  const nullW = tip2World({ seed: 11, end: END });
  const ARGS = { fundingForDay: () => 0, rules: FAST };

  it('ileri dönem başlamadıysa: yetersiz, n=0, çökmez', () => {
    const r = evaluateForwardF1({ seriesList: planted, ...ARGS, now: at(2026, 10, 1) });
    expect(r.status).toBe('yetersiz'); expect(r.n).toBe(0);
  });
  it('90 günden az veri → yetersiz ama akan ortalamayı ve ilerlemeyi gösterir', () => {
    const r = evaluateForwardF1({ seriesList: planted, ...ARGS, now: at(2026, 11, 20) });
    expect(r.status).toBe('yetersiz');
    expect(r.n).toBe(50); expect(r.needed).toBe(90);
    expect(Number.isFinite(r.mean)).toBe(true);
    expect(r.checks).toEqual([]); // erken karar YOK
  });
  it('yalnız ileri dönem günlerini sayar: ilk gün = başlangıç, son gün = dün', () => {
    const r = evaluateForwardF1({ seriesList: planted, ...ARGS, now: at(2026, 11, 20) });
    expect(r.firstDay).toBe(at(2026, 10, 1)); expect(r.lastDay).toBe(at(2026, 11, 19));
  });
  it('PLANTED kenar, ≥ 90 gün → GEÇTİ', () => {
    const r = evaluateForwardF1({ seriesList: planted, ...ARGS, now: at(2027, 2, 15) });
    expect(r.n).toBeGreaterThanOrEqual(90);
    expect(r.status).toBe('geçti');
  }, 120_000);
  it('NULL (kenar yok), ≥ 90 gün → KALDI', () => {
    const r = evaluateForwardF1({ seriesList: nullW, ...ARGS, now: at(2027, 2, 15) });
    expect(r.status).toBe('kaldı');
  }, 120_000);
});

describe('evaluateForwardTip1', () => {
  it('100\'den az işlem → yetersiz', () => {
    const r = evaluateForwardTip1({ symbolsData: tip1World({ planted: true, end: END }), now: at(2026, 11, 1), rules: FAST });
    expect(r.status).toBe('yetersiz'); expect(r.needed).toBe(100);
  }, 180_000);
  it('PLANTED → GEÇTİ', () => {
    const r = evaluateForwardTip1({ symbolsData: tip1World({ planted: true, end: END }), now: at(2027, 3, 25), rules: FAST });
    expect(r.n).toBeGreaterThanOrEqual(100);
    expect(r.status).toBe('geçti');
  }, 240_000);
  it('NULL → KALDI', () => {
    const r = evaluateForwardTip1({ symbolsData: tip1World({ planted: false, end: END }), now: at(2027, 3, 25), rules: FAST });
    expect(r.status).toBe('kaldı');
  }, 240_000);
});
