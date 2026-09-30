import { describe, it, expect } from 'vitest';
import { runTip1Family, runTip2Family } from '../../../src/domain/lab/lab-pipeline.js';
import { makeHoldoutLock } from '../../../src/domain/lab/holdout-lock.js';
import { buildSeries, makeF1, makeF2, makeF3, DAY } from '../../../src/domain/lab/basket-factors.js';
import { fundingZScores } from '../../../src/domain/lab/funding-extreme.js';
import { mulberry32 } from '../../../src/domain/lab/stats.js';

// Bu dosya sınavın KENDİSİNİ sınar (üretici çıktısıyla tüketici testi — cerebrum 2026-06-01 dersi):
//  • planted dünya: gerçek bir kenar gömülü → sınav onu YAKALAMALI (güç)
//  • null dünya: kenar yok → sınav GEÇİRMEMELİ (yanlış-pozitif kontrolü)
const FAST = { randomTrials: 20, sanityTrials: 10, bootstrapIterations: 800 };
const START = Date.UTC(2024, 2, 1);
const END = Date.UTC(2026, 9, 6);
const H = 3_600_000;

const gauss = (rand) => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand());
const memLock = () => { let st = null; return makeHoldoutLock({ read: () => st, write: (s) => { st = s; } }); };

function tip2World({ mu = () => 0, sigma = 0.02, seed = 1, nSymbols = 30 }) {
  const rand = mulberry32(seed);
  const n = Math.round((END - START) / DAY);
  return Array.from({ length: nSymbols }, (_, s) => {
    let prev = 100; const candles = [];
    for (let i = 0; i < n; i++) {
      const close = prev * (1 + mu(s) + sigma * gauss(rand));
      candles.push({ timestamp: START + i * DAY, open: prev, high: Math.max(prev, close) * 1.005, low: Math.min(prev, close) * 0.995, close, volume: 2e7 / close });
      prev = close;
    }
    return buildSeries(`SYM${String(s).padStart(2, '0')}`, candles);
  });
}

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

function tip1World({ planted, seed = 3, nSymbols = 12 }) {
  const rand = mulberry32(seed);
  return Array.from({ length: nSymbols }, (_, s) => {
    const funding = []; const drift = new Map();
    for (let t = START; t < END; t += 8 * H) {
      const spike = rand() < 1 / 40; const sign = rand() < 0.5 ? 1 : -1;
      funding.push({ timestamp: t, rate: spike ? sign * 0.0012 : 0.0001 + (rand() - 0.5) * 0.00004 });
      if (spike && planted) for (let k = 1; k <= 24; k++) drift.set(t + k * H, -sign * 0.003); // kalabalığın TERSİNE hareket
    }
    let prev = 100; const candles1h = [];
    for (let t = START; t < END; t += H) {
      const close = prev * (1 + (drift.get(t) ?? 0) + 0.004 * gauss(rand));
      candles1h.push({ timestamp: t, open: prev, high: Math.max(prev, close) * 1.003, low: Math.min(prev, close) * 0.997, close, volume: 1 });
      prev = close;
    }
    return { symbol: `T${s}USDT`, candles1h, zScores: fundingZScores(funding, { window: 90, minPeriods: 30 }), pnlSeries: funding, rank: 5 };
  });
}
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
