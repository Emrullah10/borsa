import { describe, it, expect } from 'vitest';
import { evaluateOutcome } from './tracker.js';

// Helper: candle oluştur
const candle = (high, low, close) => ({ open: close, high, low, close });

const BASE = {
  direction: 'long',
  entry_price: '1000',
  stop_price:  '900',   // risk = 100
  target_price: '1150', // reward = 150, pnlR = 1.5
  signal_created_at: new Date(Date.now() - 60_000).toISOString(),
};

const TIMEOUT_MS = 4 * 60 * 60 * 1000;

describe('evaluateOutcome — LONG', () => {
  it('mum high hedefi geçince tp_hit döner', () => {
    const r = evaluateOutcome(BASE, candle(1150, 1020, 1100));
    expect(r.status).toBe('tp_hit');
    expect(r.exitPrice).toBe(1150);
    expect(r.pnlR).toBeCloseTo(1.5);
  });

  it('mum low stopa düşünce sl_hit döner', () => {
    const r = evaluateOutcome(BASE, candle(1050, 900, 950));
    expect(r.status).toBe('sl_hit');
    expect(r.exitPrice).toBe(900);
    expect(r.pnlR).toBe(-1);
  });

  it('mum low stopa + high hedefi geçerse SL öncelikli (tie-break)', () => {
    const r = evaluateOutcome(BASE, candle(1150, 900, 1050));
    expect(r.status).toBe('sl_hit');
  });

  it('fiyat stop ile hedef arasındaysa null döner', () => {
    expect(evaluateOutcome(BASE, candle(1080, 950, 1050))).toBeNull();
  });

  it('timeout süresi geçince timeout döner (close fiyatı)', () => {
    const old = { ...BASE, signal_created_at: new Date(Date.now() - TIMEOUT_MS - 1000).toISOString() };
    const r = evaluateOutcome(old, candle(1060, 1040, 1050), Date.now(), TIMEOUT_MS);
    expect(r.status).toBe('timeout');
    expect(r.exitPrice).toBe(1050);
  });
});

describe('evaluateOutcome — SHORT', () => {
  const SHORT = {
    direction: 'short',
    entry_price: '1000',
    stop_price:  '1100', // risk = 100
    target_price: '850', // reward = 150
    signal_created_at: new Date(Date.now() - 60_000).toISOString(),
  };

  it('mum low hedefin altına düşünce tp_hit döner', () => {
    const r = evaluateOutcome(SHORT, candle(980, 850, 900));
    expect(r.status).toBe('tp_hit');
    expect(r.pnlR).toBeCloseTo(1.5);
  });

  it('mum high stopun üzerine çıkınca sl_hit döner', () => {
    const r = evaluateOutcome(SHORT, candle(1100, 950, 980));
    expect(r.status).toBe('sl_hit');
    expect(r.pnlR).toBe(-1);
  });

  it('mum high stop + low hedef → SL öncelikli', () => {
    const r = evaluateOutcome(SHORT, candle(1100, 850, 980));
    expect(r.status).toBe('sl_hit');
  });

  it('fiyat stop ile hedef arasındaysa null döner', () => {
    expect(evaluateOutcome(SHORT, candle(990, 940, 960))).toBeNull();
  });
});
