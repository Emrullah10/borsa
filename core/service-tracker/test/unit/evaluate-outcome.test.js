import { describe, it, expect } from 'vitest';
import { evaluateOutcome, evaluateSimOutcome } from '../../src/domain/evaluate-outcome.js';

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
    expect(r.tieBreak).toBe(true);
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

  it('temiz SL (tie yok) durumunda tieBreak flag yok', () => {
    const r = evaluateOutcome(BASE, candle(1050, 900, 950));
    expect(r.tieBreak).toBeFalsy();
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
    expect(r.tieBreak).toBe(true);
  });

  it('fiyat stop ile hedef arasındaysa null döner', () => {
    expect(evaluateOutcome(SHORT, candle(990, 940, 960))).toBeNull();
  });
});

describe('evaluateSimOutcome', () => {
  const takerFee = 0.0006;

  it('LONG tp_hit: sim risk üzerinden pnlR hesaplar, fee düşer', () => {
    // simEntry=1010 (slippage'lı), stop=900 → simRisk=110; target=1150 → reward=140
    const r = evaluateSimOutcome({
      direction: 'long',
      simEntry: 1010,
      stopPrice: 900,
      targetPrice: 1150,
      status: 'tp_hit',
      exitPrice: 1150,
      takerFee,
    });
    const grossR = (1150 - 1010) / 110; // 1.2727...
    const feeR = (2 * takerFee * 1010) / 110;
    expect(r.simPnlR).toBeCloseTo(grossR - feeR, 4);
  });

  it('LONG sl_hit: negatif simPnlR, fee dahil', () => {
    const r = evaluateSimOutcome({
      direction: 'long',
      simEntry: 1010,
      stopPrice: 900,
      targetPrice: 1150,
      status: 'sl_hit',
      exitPrice: 900,
      takerFee,
    });
    const grossR = (900 - 1010) / 110; // -1
    const feeR = (2 * takerFee * 1010) / 110;
    expect(r.simPnlR).toBeCloseTo(grossR - feeR, 4);
  });

  it('SHORT tp_hit: yön ters çevrilir', () => {
    const r = evaluateSimOutcome({
      direction: 'short',
      simEntry: 990,
      stopPrice: 1100,
      targetPrice: 850,
      status: 'tp_hit',
      exitPrice: 850,
      takerFee,
    });
    const simRisk = Math.abs(990 - 1100); // 110
    const grossR = (990 - 850) / simRisk;
    const feeR = (2 * takerFee * 990) / simRisk;
    expect(r.simPnlR).toBeCloseTo(grossR - feeR, 4);
  });

  it('timeout: exitPrice (close) ile hesaplar', () => {
    const r = evaluateSimOutcome({
      direction: 'long',
      simEntry: 1000,
      stopPrice: 900,
      targetPrice: 1150,
      status: 'timeout',
      exitPrice: 1020,
      takerFee,
    });
    expect(r.simPnlR).not.toBeNull();
  });

  it('sıfır risk durumunda (simEntry === stopPrice) simPnlR null döner', () => {
    const r = evaluateSimOutcome({
      direction: 'long',
      simEntry: 900,
      stopPrice: 900,
      targetPrice: 1150,
      status: 'tp_hit',
      exitPrice: 1150,
      takerFee,
    });
    expect(r.simPnlR).toBeNull();
  });

  it('simEntry null ise simPnlR null döner (henüz doldurulmadı)', () => {
    const r = evaluateSimOutcome({
      direction: 'long',
      simEntry: null,
      stopPrice: 900,
      targetPrice: 1150,
      status: 'tp_hit',
      exitPrice: 1150,
      takerFee,
    });
    expect(r.simPnlR).toBeNull();
  });

  // --- Çıkış kayması (exit slippage) ---
  // Gerekçe: stop tetiklenince fiyat genelde seviyeden GEÇER (stop-through),
  // gerçek dolum stop'tan kötüdür. TP ise limit emirle dolar → kayma yok.
  // Bu modellenmediğinde ölçülen edge sistematik olarak YUKARI sapıyordu.
  describe('çıkış kayması', () => {
    const exitSlippagePct = 0.0003;

    it('LONG sl_hit: çıkış stop seviyesinin ALTINDA dolar (aleyhe)', () => {
      const args = {
        direction: 'long',
        simEntry: 1010,
        stopPrice: 900,
        targetPrice: 1150,
        status: 'sl_hit',
        exitPrice: 900,
        takerFee,
      };
      const withSlip = evaluateSimOutcome({ ...args, exitSlippagePct });
      const without = evaluateSimOutcome(args);

      const simRisk = 110;
      const realExit = 900 * (1 - exitSlippagePct); // long stop → aşağı kayar
      const grossR = (realExit - 1010) / simRisk;
      const feeR = (2 * takerFee * 1010) / simRisk;

      expect(withSlip.simPnlR).toBeCloseTo(grossR - feeR, 4);
      expect(withSlip.simPnlR).toBeLessThan(without.simPnlR);
    });

    it('SHORT sl_hit: çıkış stop seviyesinin ÜSTÜNDE dolar (aleyhe)', () => {
      const withSlip = evaluateSimOutcome({
        direction: 'short',
        simEntry: 990,
        stopPrice: 1100,
        targetPrice: 850,
        status: 'sl_hit',
        exitPrice: 1100,
        takerFee,
        exitSlippagePct,
      });

      const simRisk = 110;
      const realExit = 1100 * (1 + exitSlippagePct); // short stop → yukarı kayar
      const grossR = -1 * (realExit - 990) / simRisk;
      const feeR = (2 * takerFee * 990) / simRisk;

      expect(withSlip.simPnlR).toBeCloseTo(grossR - feeR, 4);
    });

    it('tp_hit: limit emirle dolar, kayma UYGULANMAZ', () => {
      const args = {
        direction: 'long',
        simEntry: 1010,
        stopPrice: 900,
        targetPrice: 1150,
        status: 'tp_hit',
        exitPrice: 1150,
        takerFee,
      };
      expect(evaluateSimOutcome({ ...args, exitSlippagePct }).simPnlR)
        .toBeCloseTo(evaluateSimOutcome(args).simPnlR, 6);
    });

    it('timeout: market kapanış → kayma UYGULANIR', () => {
      const args = {
        direction: 'long',
        simEntry: 1000,
        stopPrice: 900,
        targetPrice: 1150,
        status: 'timeout',
        exitPrice: 1020,
        takerFee,
      };
      const withSlip = evaluateSimOutcome({ ...args, exitSlippagePct });
      expect(withSlip.simPnlR).toBeLessThan(evaluateSimOutcome(args).simPnlR);
    });

    it('exitSlippagePct verilmezse davranış değişmez (geriye uyumlu)', () => {
      const args = {
        direction: 'long',
        simEntry: 1010,
        stopPrice: 900,
        targetPrice: 1150,
        status: 'sl_hit',
        exitPrice: 900,
        takerFee,
      };
      const simRisk = 110;
      const expected = (900 - 1010) / simRisk - (2 * takerFee * 1010) / simRisk;
      expect(evaluateSimOutcome(args).simPnlR).toBeCloseTo(expected, 4);
    });
  });
});
