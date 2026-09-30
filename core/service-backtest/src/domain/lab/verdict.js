// Lab (2026-09-30) — ÖNCEDEN KAYITLI karar kuralları (spec: strateji-laboratuvari-design).
// Dondurulmuş: sonuçlara bakıp gevşetilemez (verdict.test.js bunları sabitler).
export const RULES = Object.freeze({
  families: Object.freeze(['funding_extreme', 'F1_momentum', 'F2_reversal', 'F3_smallcap']),
  alpha: 0.05,
  // Bonferroni: 4 aile → aile başına α = 0.05/4 → %98.75 güven düzeyi
  ciLevel: 1 - 0.05 / 4,
  costStressMultiplier: 2,
  minTradesTip1: 100,
  randomTrials: 200,
  randomPercentileMin: 0.95,
  bootstrapIterations: 4000,
  basketBlockDays: 5,
});

const f = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');

// Doğrulama kapısı: seçilen aday doğrulama döneminde ≤ 0 ise holdout hiç AÇILMAZ.
export function judgeValidation({ mean, n }) {
  if (!n || !(mean > 0)) {
    return { passed: false, reason: `Doğrulama döneminde ortalama ${f(mean)} (n=${n ?? 0}) ≤ 0 — holdout AÇILMADI.` };
  }
  return { passed: true, reason: `Doğrulama ortalaması ${f(mean)} > 0 (n=${n}) — holdout açılabilir.` };
}

// Nihai sınav (holdout): dört koşulun HEPSİ sağlanmalı.
export function judgeHoldout({ tip, ci, stressMean, randomPercentile, nTrades }) {
  const checks = [
    {
      name: 'ciLowPositive', passed: ci.low > 0,
      detail: `Bonferroni %${(RULES.ciLevel * 100).toFixed(2)} güven aralığı [${f(ci.low)}, ${f(ci.high)}], ortalama ${f(ci.mean)} — alt sınır ${ci.low > 0 ? 'sıfırın ÜSTÜNDE' : 'sıfırın ALTINDA/EŞİT (kâr şansa bağlı olabilir)'}.`,
    },
    {
      name: 'stressPositive', passed: stressMean > 0,
      detail: `Maliyetler ×${RULES.costStressMultiplier} olsa ortalama ${f(stressMean)} — ${stressMean > 0 ? 'hâlâ pozitif' : 'eksiye düşüyor (kâr maliyet tahminine fazla duyarlı)'}.`,
    },
    {
      name: 'randomBeaten', passed: randomPercentile >= RULES.randomPercentileMin,
      detail: `${RULES.randomTrials} rastgele denemenin %${(randomPercentile * 100).toFixed(1)}'ini geçti (gereken ≥ %${RULES.randomPercentileMin * 100}).`,
    },
  ];
  if (tip === 'tip1') {
    checks.push({
      name: 'enoughTrades', passed: nTrades >= RULES.minTradesTip1,
      detail: `${nTrades} işlem (gereken ≥ ${RULES.minTradesTip1}).`,
    });
  }
  return { passed: checks.every((c) => c.passed), checks };
}

// Sınavın kendisi sağlam mı? Rastgele yönlü strateji maliyetten dolayı kaybetmeli.
// Ortalamasının CI alt sınırı > 0 ise sınav bozuktur (sızıntı/yanlı muhasebe).
export function assessExamSanity({ randomMeanCI }) {
  if (randomMeanCI && randomMeanCI.low > 0) {
    return { sane: false, detail: `SINAV BOZUK: rastgele yönlü strateji kâr ediyor (ortalama ${f(randomMeanCI.mean)}, alt sınır ${f(randomMeanCI.low)} > 0). Sızıntı ya da yanlı muhasebe olabilir — sonuçlara güvenme.` };
  }
  return { sane: true, detail: `Sınav sağlam: rastgele strateji kâr etmiyor (ortalama ${f(randomMeanCI?.mean)}).` };
}
