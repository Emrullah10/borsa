import { describe, it, expect } from 'vitest';
import {
  COST, sideCost, feesForSimulator, indexFundingByDay, sumFundingBetween, fundingPnlFraction,
} from '../../../src/domain/lab/cost-model.js';

const H = 3_600_000;
const DAY = 24 * H;

describe('sideCost (taraf başına: taker fee + kayma)', () => {
  it('likit (ilk 20) → 0.0006 + 0.0003', () => expect(sideCost({ rank: 5 })).toBeCloseTo(0.0009, 10));
  it('ince (21+) → 0.0006 + 0.0008 (ölçülen spread/derinlik farkı)', () => expect(sideCost({ rank: 21 })).toBeCloseTo(0.0014, 10));
  it('sınır: rank 20 likit, 21 ince', () => {
    expect(sideCost({ rank: COST.liquidTopN })).toBeCloseTo(0.0009, 10);
    expect(sideCost({ rank: COST.liquidTopN + 1 })).toBeCloseTo(0.0014, 10);
  });
  it('maliyet stresi ×2 hem fee hem kaymayı iki katına çıkarır', () => {
    expect(sideCost({ rank: 5, costMultiplier: 2 })).toBeCloseTo(0.0018, 10);
  });
  it('rank bilinmiyorsa temkinli davranır (ince sayılır)', () => expect(sideCost({})).toBeCloseTo(0.0014, 10));
});

describe('feesForSimulator', () => {
  it('simulateTrade alanlarını üretir (taker giriş)', () => {
    expect(feesForSimulator({ rank: 5 })).toEqual({ takerFee: 0.0006, slippagePct: 0.0003, exitSlippagePct: 0.0003, entryMode: 'taker' });
  });
  it('ince coin + ×2 stres', () => {
    expect(feesForSimulator({ rank: 40, costMultiplier: 2 })).toEqual({ takerFee: 0.0012, slippagePct: 0.0016, exitSlippagePct: 0.0016, entryMode: 'taker' });
  });
});

describe('sumFundingBetween (fromExclusive, toInclusive]', () => {
  const series = [
    { timestamp: 0, rate: 0.0001 }, { timestamp: 8 * H, rate: 0.0002 },
    { timestamp: 16 * H, rate: -0.0001 }, { timestamp: 24 * H, rate: 0.0003 },
  ];
  it('başlangıç HARİÇ, bitiş DAHİL', () => {
    expect(sumFundingBetween(series, 0, 16 * H)).toBeCloseTo(0.0002 - 0.0001, 12);
  });
  it('aralıkta ödeme yoksa 0', () => expect(sumFundingBetween(series, 1, 2 * H)).toBe(0));
  it('boş seri → 0', () => expect(sumFundingBetween([], 0, DAY)).toBe(0));
  it('tam aralık', () => expect(sumFundingBetween(series, -1, 24 * H)).toBeCloseTo(0.0005, 12));
});

describe('indexFundingByDay (UTC gün başına toplam, [gün, gün+24s))', () => {
  it('ödemeleri UTC günlerine toplar', () => {
    const s = [{ timestamp: 0, rate: 0.0001 }, { timestamp: 8 * H, rate: 0.0001 }, { timestamp: 24 * H, rate: 0.0005 }];
    const m = indexFundingByDay(s);
    expect(m.get(0)).toBeCloseTo(0.0002, 12);
    expect(m.get(DAY)).toBeCloseTo(0.0005, 12);
    expect(m.get(2 * DAY)).toBeUndefined();
  });
});

describe('fundingPnlFraction (long pozitif oranı ÖDER, short ALIR)', () => {
  it('long + pozitif oran → negatif PnL', () => expect(fundingPnlFraction('long', 0.001)).toBeCloseTo(-0.001, 12));
  it('short + pozitif oran → pozitif PnL', () => expect(fundingPnlFraction('short', 0.001)).toBeCloseTo(0.001, 12));
  it('long + negatif oran → pozitif PnL', () => expect(fundingPnlFraction('long', -0.001)).toBeCloseTo(0.001, 12));
  it('short + negatif oran → negatif PnL', () => expect(fundingPnlFraction('short', -0.001)).toBeCloseTo(-0.001, 12));
});
