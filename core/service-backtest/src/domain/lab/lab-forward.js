// Lab (2026-09-30) — İLERİ TEST: lab'da seçilen adaylar DONDURULDU; yalnızca FORWARD.start
// sonrası (taze) veriyle değerlendirilir. F1'in 2026 holdout'u yandı (aday başına tek bakış) —
// geçmişe tekrar bakmak veri avcılığıdır; ileri dönem gerçek sınavdır. Para riski yok (kâğıt üstü).
//
// Aynı ölçüm kodu (runBasket / runFundingStrategy / judgeHoldout) — sadece kurallar ve dönem farklı.
import { runBasket, decisionDaysBetween } from './basket-portfolio.js';
import { makeF1, DAY } from './basket-factors.js';
import { makeTip1TradeRunner, evaluateHoldout, WEEK_MS } from './lab-pipeline.js';
import { mean } from './stats.js';
import { makeRandom } from './basket-factors.js';

// DONDURULMUŞ (2026-09-30). Sonuca bakıp değiştirilemez; test bunu sabitler.
export const FORWARD = Object.freeze({
  start: Date.UTC(2026, 9, 1),          // ilk işlem günü: 2026-10-01 00:00 UTC
  minDays: 90,                          // Tip 2: en az 90 işlem günü
  minTradesTip1: 100,                   // Tip 1: en az 100 işlem
  families: Object.freeze(['F1_momentum', 'funding_extreme']),
  ciLevel: 1 - 0.05 / 2,                // 2 aile → Bonferroni %97.5
  costStressMultiplier: 2,
  randomTrials: 200,
  randomPercentileMin: 0.95,
  bootstrapIterations: 4000,
  basketBlockDays: 5,
  trimFraction: 0.025,
  F1: Object.freeze({ L: 28, rebalanceEvery: 7, k: 5 }),
  tip1: Object.freeze({ z: 2.5, holdHours: 72, stopAtrMult: 3, minAbsRate: 0.0002 }),
});

const dayStart = (now) => Math.floor(now / DAY) * DAY;
const STATUS = (passed) => (passed ? 'geçti' : 'kaldı');

/** Tip 2 — F1 momentum, dondurulmuş ayar. `rules` yalnızca testte hızlandırma içindir. */
export function evaluateForwardF1({ seriesList, fundingForDay, now = Date.now(), rules = {} }) {
  const R = { ...FORWARD, ...rules };
  const days = decisionDaysBetween(FORWARD.start, dayStart(now));
  const run = ({ costMultiplier = 1, scoreFn = makeF1(FORWARD.F1.L) } = {}) => runBasket({
    seriesList, scoreFn, decisionDays: days, rebalanceEvery: FORWARD.F1.rebalanceEvery,
    k: FORWARD.F1.k, costMultiplier, fundingForDay,
  }).map((d) => d.net);

  const nets = run();
  const base = {
    key: 'F1_momentum', title: `F1 momentum (L=${FORWARD.F1.L}g, haftalık dengeleme)`,
    n: nets.length, needed: R.minDays, mean: mean(nets),
    firstDay: days.length ? days[0] + DAY : null, lastDay: days.length ? days.at(-1) + DAY : null,
  };
  if (nets.length < R.minDays) return { ...base, status: 'yetersiz', holdout: null, checks: [] };

  const stressMean = mean(run({ costMultiplier: R.costStressMultiplier }));
  const randomMeans = Array.from({ length: R.randomTrials }, (_, i) => mean(run({ scoreFn: makeRandom(9000 + i) })));
  const { verdict, holdout } = evaluateHoldout({ tip: 'tip2', values: nets, blockSize: R.basketBlockDays, stressMean, randomMeans, R });
  return { ...base, status: STATUS(verdict.passed), holdout, checks: verdict.checks ?? [] };
}

/** Tip 1 — funding uçları, dondurulmuş ayar (z=2.5, 72s, 3×ATR). */
export function evaluateForwardTip1({ symbolsData, now = Date.now(), rules = {} }) {
  const R = { ...FORWARD, ...rules };
  const runner = makeTip1TradeRunner({ symbolsData, minAbsRate: FORWARD.tip1.minAbsRate });
  const combo = { z: FORWARD.tip1.z, holdHours: FORWARD.tip1.holdHours, stopAtrMult: FORWARD.tip1.stopAtrMult };
  const to = dayStart(now);
  const trades = runner(combo, FORWARD.start, to);
  const values = trades.map((t) => t.r);
  const base = { key: 'funding_extreme', title: 'Funding uçları (z=2.5, 72s, stop 3×ATR)', n: trades.length, needed: R.minTradesTip1, mean: mean(values), firstDay: FORWARD.start, lastDay: to - DAY };
  if (trades.length < R.minTradesTip1) return { ...base, status: 'yetersiz', holdout: null, checks: [] };

  const stressMean = mean(runner(combo, FORWARD.start, to, { costMultiplier: R.costStressMultiplier }).map((t) => t.r));
  const randomMeans = Array.from({ length: R.randomTrials }, (_, i) => mean(runner(combo, FORWARD.start, to, { randomSeed: 9000 + i }).map((t) => t.r)));
  const { verdict, holdout } = evaluateHoldout({
    tip: 'tip1', values, clusterKeys: trades.map((t) => Math.floor(t.timestamp / WEEK_MS)), stressMean, randomMeans, R,
  });
  return { ...base, status: STATUS(verdict.passed), holdout, checks: verdict.checks ?? [] };
}

