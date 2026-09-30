// Lab (2026-09-30) — Tip 2 günlük sepet motoru.
//
// Karar günü d'nin kapanışında (bilgi ≤ d) skorla → işlem günü d+1'in AÇILIŞINDA gir, KAPANIŞINDA
// değerlendir (getiri = close/open − 1). Ağırlıklar ±1/(2k): brüt maruziyet 1, long/short dengeli.
// Maliyet yalnızca AĞIRLIK DEĞİŞİMİNE ödenir (devam eden pozisyon yeniden ücretlenmez).
// Funding: long pozitif oranı öder, short alır; gün içindeki ödemelerin toplamı fundingForDay'den gelir.
import { sideCost } from './cost-model.js';
import { DAY } from './basket-factors.js';

const AVG_VOL_WINDOW = 30;

/**
 * @param {object} p
 * @param {Array} p.seriesList   basket-factors.buildSeries çıktıları
 * @param {(members:Array, day:number)=>Map<string,number>} p.scoreFn  makeF1/makeF2/makeF3/makeRandom
 * @param {number[]} p.decisionDays  artan; işlem günü = gün + 24s
 * @param {number} [p.rebalanceEvery=1]  gün cinsinden; ara günlerde pozisyon aynen tutulur
 * @param {number} [p.k=5]
 * @param {number} [p.costMultiplier=1]
 * @param {number} [p.minAvgUsdVolume=5e6]  30g ort. USD hacim (close×volume) — o güne göre
 * @param {number} [p.minHistoryDays=60]
 * @param {(symbol:string, tradeDayStart:number)=>number|null} [p.fundingForDay]  null = bilinmiyor
 */
export function runBasket({
  seriesList, scoreFn, decisionDays, rebalanceEvery = 1, k = 5, costMultiplier = 1,
  minAvgUsdVolume = 5_000_000, minHistoryDays = 60, fundingForDay = () => null,
}) {
  const bySymbol = new Map(seriesList.map((s) => [s.symbol, s]));
  const lastRank = new Map();
  const out = [];
  let weights = new Map();

  for (const d of decisionDays) {
    const u = d + DAY;

    // --- Evren (yalnızca ≤ d bilgisiyle) ---
    const members = []; const avgVol = new Map();
    for (const series of seriesList) {
      const idx = series.byDay.get(d);
      if (idx == null || idx + 1 < minHistoryDays || idx < AVG_VOL_WINDOW - 1) continue;
      if (series.candles[idx - (AVG_VOL_WINDOW - 1)].timestamp !== d - (AVG_VOL_WINDOW - 1) * DAY) continue; // boşluk
      let vol = 0;
      for (let j = 0; j < AVG_VOL_WINDOW; j++) vol += series.candles[idx - j].close * series.candles[idx - j].volume;
      vol /= AVG_VOL_WINDOW;
      if (vol < minAvgUsdVolume) continue;
      members.push({ symbol: series.symbol, series, idx });
      avgVol.set(series.symbol, vol);
    }
    const rank = new Map(
      [...members].sort((a, b) => avgVol.get(b.symbol) - avgVol.get(a.symbol) || (a.symbol < b.symbol ? -1 : 1))
        .map((m, i) => [m.symbol, i + 1]),
    );
    for (const [s, r] of rank) lastRank.set(s, r);

    // --- Hedef ağırlıklar ---
    let target = weights;
    if (Math.floor(d / DAY) % rebalanceEvery === 0) {
      target = new Map();
      if (members.length >= 2 * k) {
        const ordered = [...scoreFn(members, d).entries()]
          .filter(([s]) => rank.has(s))
          .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
        if (ordered.length >= 2 * k) {
          for (const [s] of ordered.slice(0, k)) target.set(s, 1 / (2 * k));
          for (const [s] of ordered.slice(-k)) target.set(s, -1 / (2 * k));
        }
      }
    }

    // --- Devir maliyeti (yalnızca ağırlık değişimi) ---
    let turnover = 0; let cost = 0;
    for (const s of new Set([...weights.keys(), ...target.keys()])) {
      const delta = Math.abs((target.get(s) ?? 0) - (weights.get(s) ?? 0));
      if (delta === 0) continue;
      turnover += delta;
      cost += delta * sideCost({ rank: rank.get(s) ?? lastRank.get(s), costMultiplier });
    }

    // --- İşlem günü PnL ---
    let gross = 0; let funding = 0; let missingReturns = 0; let missingFunding = 0;
    for (const [s, w] of target) {
      const series = bySymbol.get(s);
      const idx = series.byDay.get(u);
      if (idx == null) missingReturns++;
      else { const c = series.candles[idx]; gross += w * (c.close / c.open - 1); }
      const rateSum = fundingForDay(s, u);
      if (rateSum == null) missingFunding++; else funding += -w * rateSum;
    }

    weights = target;
    out.push({
      ts: u, gross, cost, funding, net: gross - cost + funding, turnover,
      longs: [...target].filter(([, w]) => w > 0).map(([s]) => s).sort(),
      shorts: [...target].filter(([, w]) => w < 0).map(([s]) => s).sort(),
      universeSize: members.length, missingReturns, missingFunding,
    });
  }
  return out;
}
