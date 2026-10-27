import { describe, it, expect } from 'vitest';
import { planOpen, planClose, fundingPayment, positionPnl, slotNotional } from '../../src/domain/paper-book.js';

const open = () => planOpen({ symbol: 'SOLUSDT', notionalUsd: 180, spotAsk: 150, perpBid: 150, at: 0, apr: 0.3 });

describe('paper-book', () => {
  it('slotNotional: sermayenin %90\'ı N slota bölünür', () => {
    expect(slotNotional(1000, 5)).toBeCloseTo(180, 10);
  });

  it('açılış: aynı adet spot + perp, komisyon iki bacaktan', () => {
    const p = open();
    expect(p.qty).toBeCloseTo(1.2, 10);
    expect(p.entryFees).toBeCloseTo(180 * 0.001 + 180 * 0.0006, 10);
  });

  it('delta-nötr: fiyat %50 düşse de iki bacak birbirini götürür (baz PnL 0)', () => {
    const pnl = positionPnl(open(), { fundingUsd: 0, spotBid: 75, perpAsk: 75 });
    expect(pnl.basisUsd).toBeCloseTo(0, 10);
  });

  it('delta-nötr: fiyat 2 katına çıksa da baz PnL 0', () => {
    const pnl = positionPnl(open(), { fundingUsd: 0, spotBid: 300, perpAsk: 300 });
    expect(pnl.basisUsd).toBeCloseTo(0, 10);
  });

  it('pozitif funding short bacağa ödeme olarak gelir', () => {
    expect(fundingPayment({ qty: 1.2, rate: 0.0001, markPrice: 150 })).toBeCloseTo(0.018, 10);
    expect(fundingPayment({ qty: 1.2, rate: -0.0001, markPrice: 150 })).toBeCloseTo(-0.018, 10);
  });

  it('kapanış: net = funding + baz - (giriş+çıkış komisyonu)', () => {
    const c = planClose(open(), { spotBid: 160, perpAsk: 160.1, at: 1, reason: 'funding-düştü' });
    const pnl = positionPnl(c, { fundingUsd: 2 });
    const exitFees = 1.2 * 160 * 0.001 + 1.2 * 160.1 * 0.0006;
    expect(pnl.basisUsd).toBeCloseTo(1.2 * 10 - 1.2 * 10.1, 10);
    expect(pnl.netUsd).toBeCloseTo(2 + pnl.basisUsd - (c.entryFees + exitFees), 10);
  });
});
