import { describe, it, expect } from 'vitest';
import { runTip1Family, runTip2Family } from '../../../src/domain/lab/lab-pipeline.js';
import { makeHoldoutLock } from '../../../src/domain/lab/holdout-lock.js';
import { makeF1, makeF2, makeF3 } from '../../../src/domain/lab/basket-factors.js';
import { tip1World, tip2World } from './_worlds.js';

// Bu dosya sınavın KENDİSİNİ sınar (üretici çıktısıyla tüketici testi — cerebrum 2026-06-01 dersi):
//  • planted dünya: gerçek bir kenar gömülü → sınav onu YAKALAMALI (güç)
//  • null dünya: kenar yok → sınav GEÇİRMEMELİ (yanlış-pozitif kontrolü)
const FAST = { randomTrials: 20, sanityTrials: 10, bootstrapIterations: 800 };

const memLock = () => { let st = null; return makeHoldoutLock({ read: () => st, write: (s) => { st = s; } }); };

const tip2Families = () => ([
  { key: 'F1_momentum', title: 'F1', configs: [7, 14, 28].flatMap((L) => [1, 7].map((r) => ({ label: `L=${L}, ${r}g`, scoreFn: makeF1(L), rebalanceEvery: r }))) },
  { key: 'F2_reversal', title: 'F2', configs: [{ label: '1g', scoreFn: makeF2(), rebalanceEvery: 1 }] },
  { key: 'F3_smallcap', title: 'F3', configs: [{ label: 'kompozit', scoreFn: makeF3(), rebalanceEvery: 1 }] },
]);

function runTip2(world, opts = {}) {
  const lock = memLock();
  return Object.fromEntries(tip2Families().map((f) => [f.key, runTip2Family({
    ...f, seriesList: world, fundingForDay: () => 0, lock, openHoldout: true, rules: FAST, ...opts,
  })]));
}

describe('Tip 2 hattı — güç ve yanlış-pozitif', () => {
  it('PLANTED: kalıcı kesitsel getiri farkı (momentum) → F1 GEÇER, F2 (dönüş) GEÇMEZ', () => {
    const res = runTip2(tip2World({ mu: (s) => (s - 15) * 0.001, seed: 7 }));
    expect(res.F1_momentum.verdict.passed).toBe(true);
    expect(res.F1_momentum.holdout.ciLow).toBeGreaterThan(0);
    expect(res.F2_reversal.verdict.passed).toBe(false);
    for (const r of Object.values(res)) expect(r.sanity.sane).toBe(true);
  }, 120_000);

  it('NULL: kenar yok → hiçbir aile GEÇMEZ ve sınav sağlam', () => {
    const res = runTip2(tip2World({ seed: 11 }));
    for (const r of Object.values(res)) {
      expect(r.verdict.passed).toBe(false);
      expect(r.sanity.sane).toBe(true);
    }
  }, 120_000);

  it('doğrulamada ≤ 0 olan aday için holdout AÇILMAZ (holdout alanı null)', () => {
    const res = runTip2(tip2World({ mu: (s) => (s - 15) * 0.001, seed: 7 }));
    expect(res.F2_reversal.verdict.skipped).toBe(true);
    expect(res.F2_reversal.holdout).toBeNull();
  }, 120_000);

  it('openHoldout=false → geçse bile holdout açılmaz', () => {
    const res = runTip2(tip2World({ mu: (s) => (s - 15) * 0.001, seed: 7 }), { openHoldout: false });
    expect(res.F1_momentum.holdout).toBeNull();
    expect(res.F1_momentum.verdict.skipped).toBe(true);
  }, 120_000);

  it('aynı girdi → aynı sonuç (deterministik)', () => {
    const w = tip2World({ mu: (s) => (s - 15) * 0.001, seed: 7, nSymbols: 20 });
    const f1 = tip2Families()[0];
    const a = runTip2Family({ ...f1, seriesList: w, fundingForDay: () => 0, lock: memLock(), openHoldout: true, rules: FAST });
    const b = runTip2Family({ ...f1, seriesList: w, fundingForDay: () => 0, lock: memLock(), openHoldout: true, rules: FAST });
    expect(a).toEqual(b);
  }, 120_000);
});

const GRID = { zThresholds: [2.5], holdHours: [24], stopAtrMults: [3], minAbsRate: 0.0002 };

describe('Tip 1 hattı — güç ve yanlış-pozitif', () => {
  it('PLANTED: funding ucundan sonra ters hareket gömülü → GEÇER', () => {
    const r = runTip1Family({ symbolsData: tip1World({ planted: true }), grid: GRID, lock: memLock(), openHoldout: true, rules: FAST });
    expect(r.train.n).toBeGreaterThanOrEqual(100);
    expect(r.verdict.passed).toBe(true);
    expect(r.holdout.mean).toBeGreaterThan(0);
    expect(r.sanity.sane).toBe(true);
  }, 180_000);

  it('NULL: kenar yok → GEÇMEZ, sınav sağlam', () => {
    const r = runTip1Family({ symbolsData: tip1World({ planted: false }), grid: GRID, lock: memLock(), openHoldout: true, rules: FAST });
    expect(r.verdict.passed).toBe(false);
    expect(r.sanity.sane).toBe(true);
  }, 180_000);

  it('hiçbir kombinasyon train\'de n ≥ 100\'e ulaşmazsa aday KALDI (nedeniyle)', () => {
    const r = runTip1Family({ symbolsData: tip1World({ planted: true, nSymbols: 1 }), grid: GRID, lock: memLock(), openHoldout: true, rules: FAST });
    expect(r.verdict.passed).toBe(false);
    expect(r.verdict.reason).toMatch(/100/);
  }, 180_000);
});
