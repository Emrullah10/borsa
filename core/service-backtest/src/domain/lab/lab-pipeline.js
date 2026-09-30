// Lab (2026-09-30) — sınav hatları. Saf: veriyi alır, sonucu döner (DB/dosya YOK; lab.js sarar).
//
// Akış (her aile için, spec'teki ön-kayıtlı kurallarla):
//   1. train'de ayar seç        2. doğrulama kapısı (≤0 → holdout AÇILMAZ)
//   3. sınav sağlamlığı (train'de rastgele-ZAMAN+yön; kazanıyorsa sınav bozuk)
//   4. holdout (yalnız kapı geçtiyse + --open-holdout + kilit izin verirse):
//      Bonferroni CI alt sınırı > 0, maliyet ×2 > 0, rastgele %95'i geç, (Tip 1) n ≥ 100
import { PERIODS } from './periods.js';
import { blockBootstrapMeanCI, mean, sharpeAnnualized, percentileRank } from './stats.js';
import { RULES, judgeValidation, judgeHoldout, assessExamSanity } from './verdict.js';
import { runBasket } from './basket-portfolio.js';
import { makeRandom, DAY } from './basket-factors.js';
import { signalsFromZScores } from './funding-extreme.js';
import { runFundingStrategy } from './run-funding-strategy.js';
import { randomizeDirections, randomizeTimesAndDirections } from './random-baseline.js';

const ruleSet = (rules) => ({ ...RULES, sanityTrials: 30, ...rules });
const skipped = (reason) => ({ passed: false, skipped: true, reason });

// Karar günleri: işlem günü dönemin içinde kalacak şekilde (işlem günü = gün + 24s).
function decisionDaysFor(p) {
  const days = [];
  for (let d = p.start - DAY; d + DAY < p.end; d += DAY) days.push(d);
  return days;
}

function sanityFrom(randomMeans) {
  return assessExamSanity({ randomMeanCI: blockBootstrapMeanCI(randomMeans, { level: 0.95, iterations: 1000, seed: 1 }) });
}

// Ortak: holdout değerlendirmesi (Tip 1 ve Tip 2 aynı kuralla).
function evaluateHoldout({ tip, values, blockSize, stressMean, randomMeans, R }) {
  const ci = blockBootstrapMeanCI(values, { level: R.ciLevel, blockSize, iterations: R.bootstrapIterations, seed: 42 });
  if (!ci) return { verdict: skipped('Holdout döneminde işlem/gün yok.'), holdout: null };
  const randomPercentile = percentileRank(ci.mean, randomMeans);
  const verdict = judgeHoldout({ tip, ci, stressMean, randomPercentile, nTrades: values.length });
  return { verdict, holdout: { mean: ci.mean, ciLow: ci.low, ciHigh: ci.high, n: values.length, stressMean, randomPercentile } };
}

/**
 * Tip 2 — günlük sepet ailesi (F1/F2/F3).
 * @param {{key:string,title:string,configs:Array<{label:string,scoreFn:Function,rebalanceEvery:number}>,
 *          seriesList:Array, fundingForDay:Function, lock:object, openHoldout:boolean, force?:boolean,
 *          k?:number, rules?:object}} p
 */
export function runTip2Family({ key, title, configs, seriesList, fundingForDay, lock, openHoldout, force = false, k = 5, rules = {} }) {
  const R = ruleSet(rules);
  const run = (cfg, period, { costMultiplier = 1, scoreFn = cfg.scoreFn } = {}) => runBasket({
    seriesList, scoreFn, decisionDays: decisionDaysFor(period), rebalanceEvery: cfg.rebalanceEvery, k, costMultiplier, fundingForDay,
  }).map((d) => d.net);

  // 1) train: aile içinde en yüksek Sharpe'lı ayar
  const rows = configs.map((cfg) => { const nets = run(cfg, PERIODS.train); return { cfg, nets, sharpe: sharpeAnnualized(nets), mean: mean(nets) }; });
  const best = rows.reduce((a, b) => (b.sharpe > a.sharpe ? b : a));
  const train = { mean: best.mean, n: best.nets.length, sharpe: best.sharpe };

  // 2) doğrulama
  const valNets = run(best.cfg, PERIODS.validation);
  const validation = { mean: mean(valNets), n: valNets.length };
  const gate = judgeValidation(validation);

  // 3) sınav sağlamlığı (train)
  const sanity = sanityFrom(Array.from({ length: R.sanityTrials }, (_, i) => mean(run(best.cfg, PERIODS.train, { scoreFn: makeRandom(1000 + i) }))));

  const result = { key, title, config: best.cfg.label, train, validation, holdout: null, sanity };
  if (!gate.passed) return { ...result, verdict: skipped(gate.reason) };
  if (!openHoldout) return { ...result, verdict: { ...skipped('Doğrulamayı geçti; holdout henüz açılmadı (--open-holdout verilmedi). Holdout aday başına TEK kez açılır.'), pending: true } };

  // 4) holdout (kilitli, tek kez)
  const lk = lock.tryOpen(key, { label: best.cfg.label }, { force });
  if (!lk.allowed) return { ...result, verdict: skipped(lk.reason) };

  const hNets = run(best.cfg, PERIODS.holdout);
  const stressMean = mean(run(best.cfg, PERIODS.holdout, { costMultiplier: R.costStressMultiplier }));
  const randomMeans = Array.from({ length: R.randomTrials }, (_, i) => mean(run(best.cfg, PERIODS.holdout, { scoreFn: makeRandom(5000 + i) })));
  const { verdict, holdout } = evaluateHoldout({ tip: 'tip2', values: hNets, blockSize: R.basketBlockDays, stressMean, randomMeans, R });
  return { ...result, holdout, verdict: { ...verdict, dirty: lk.dirty } };
}

/**
 * Tip 1 — funding uçları (tek coin işlemleri, havuzlanmış).
 * @param {{symbolsData:Array<{symbol:string,candles1h:Array,zScores:Array,pnlSeries:Array,rank?:number}>,
 *          grid:{zThresholds:number[],holdHours:number[],stopAtrMults:number[],minAbsRate:number},
 *          lock:object, openHoldout:boolean, force?:boolean, rules?:object}} p
 */
export function runTip1Family({ symbolsData, grid, lock, openHoldout, force = false, rules = {} }) {
  const R = ruleSet(rules);
  const key = 'funding_extreme';
  const title = 'Funding uçları (Tip 1)';
  const combos = grid.zThresholds.flatMap((z) => grid.holdHours.flatMap((holdHours) => grid.stopAtrMults.map((stopAtrMult) => ({ z, holdHours, stopAtrMult }))));
  const label = (c) => `z=${c.z} · tutma ${c.holdHours}s · stop ${c.stopAtrMult}×ATR`;

  // randomSeed: aynı zamanlama + rastgele yön (yön kuralının EK değeri — yüzdelik testi)
  // nullSeed:   rastgele zaman + rastgele yön (sınavın kendisi yanlı mı — sağlamlık kontrolü)
  const trades = (combo, from, to, { costMultiplier = 1, randomSeed = null, nullSeed = null } = {}) => {
    const out = [];
    symbolsData.forEach((sd, i) => {
      let sigs = signalsFromZScores(sd.zScores, { zThreshold: combo.z, minAbsRate: grid.minAbsRate })
        .filter((s) => s.timestamp >= from && s.timestamp < to);
      if (randomSeed != null) sigs = randomizeDirections(sigs, randomSeed * 1009 + i);
      if (nullSeed != null) {
        const candidates = sd.zScores.map((z) => z.timestamp).filter((t) => t >= from && t < to);
        sigs = randomizeTimesAndDirections(sigs, candidates, nullSeed * 1009 + i);
      }
      out.push(...runFundingStrategy({
        symbol: sd.symbol, signals: sigs, candles1h: sd.candles1h, fundingSeries: sd.pnlSeries,
        holdHours: combo.holdHours, stopAtrMult: combo.stopAtrMult, rank: sd.rank, costMultiplier,
      }));
    });
    return out;
  };
  const rMeans = (t) => mean(t.map((x) => x.r));

  // 1) train: n ≥ 100 olan kombinasyonlar arasında en yüksek ortalama R
  const rows = combos.map((combo) => { const t = trades(combo, PERIODS.train.start, PERIODS.train.end); return { combo, n: t.length, mean: rMeans(t) }; });
  const eligible = rows.filter((r) => r.n >= R.minTradesTip1);
  if (!eligible.length) {
    const maxN = Math.max(0, ...rows.map((r) => r.n));
    return { key, title, config: '—', train: { mean: 0, n: maxN }, validation: null, holdout: null, sanity: null,
      verdict: skipped(`Hiçbir kombinasyon train'de ${R.minTradesTip1} işleme ulaşmadı (en çok ${maxN}) — karar verilemez.`) };
  }
  const best = eligible.reduce((a, b) => (b.mean > a.mean ? b : a));
  const train = { mean: best.mean, n: best.n };

  // 2) doğrulama
  const valTrades = trades(best.combo, PERIODS.validation.start, PERIODS.validation.end);
  const validation = { mean: rMeans(valTrades), n: valTrades.length };
  const gate = judgeValidation(validation);

  // 3) sınav sağlamlığı (train'de rastgele yön)
  const sanity = sanityFrom(Array.from({ length: R.sanityTrials }, (_, i) => rMeans(trades(best.combo, PERIODS.train.start, PERIODS.train.end, { nullSeed: 1000 + i }))));

  const result = { key, title, config: label(best.combo), train, validation, holdout: null, sanity };
  if (!gate.passed) return { ...result, verdict: skipped(gate.reason) };
  if (!openHoldout) return { ...result, verdict: { ...skipped('Doğrulamayı geçti; holdout henüz açılmadı (--open-holdout verilmedi). Holdout aday başına TEK kez açılır.'), pending: true } };

  // 4) holdout (kilitli, tek kez)
  const lk = lock.tryOpen(key, best.combo, { force });
  if (!lk.allowed) return { ...result, verdict: skipped(lk.reason) };

  const hTrades = trades(best.combo, PERIODS.holdout.start, PERIODS.holdout.end);
  const stressMean = rMeans(trades(best.combo, PERIODS.holdout.start, PERIODS.holdout.end, { costMultiplier: R.costStressMultiplier }));
  const randomMeans = Array.from({ length: R.randomTrials }, (_, i) => rMeans(trades(best.combo, PERIODS.holdout.start, PERIODS.holdout.end, { randomSeed: 5000 + i })));
  const { verdict, holdout } = evaluateHoldout({ tip: 'tip1', values: hTrades.map((t) => t.r), blockSize: 1, stressMean, randomMeans, R });
  return { ...result, holdout, verdict: { ...verdict, dirty: lk.dirty } };
}
