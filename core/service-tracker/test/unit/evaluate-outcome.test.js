import { describe, it, expect } from 'vitest';
import { evaluateOutcome, evaluateSimOutcome, isSimEntryFillable } from '../../src/domain/evaluate-outcome.js';

// Helper: candle oluştur
const candle = (high, low, close) => ({ open: close, high, low, close });

const BASE = {
  direction: 'long',
  entry_price: '1000',
  stop_price:  '900',   // risk = 100
  target_price: '1150', // reward = 150, pnlR = 1.5
  signal_created_at: new Date(Date.now() - 60_000).toISOString(),
};

const TF_MS_1M = 60_000;

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

  // KRİTİK DAVRANIŞ DEĞİŞİKLİĞİ (Faz 0.1, B1/B3 düzeltmesi):
  // Risk birimi artık SİNYALİN PLANLANAN riskinden (entryPrice - stopPrice)
  // hesaplanır, sim girişten YENİDEN ÖLÇÜLMEZ. Önceki `Math.abs(simEntry - stopPrice)`
  // payda yaklaşımı iki hataya yol açıyordu:
  //   1. simEntry stopPrice'ın ÖTESİNDEYSE (bayat veri/aşırı kayma) Math.abs paydayı
  //      pozitif tutuyor ama pay işaret değiştiriyor → SL zararı +1R KÂR yazılıyordu.
  //   2. R birimi işlemler arası 134× değişiyordu (simRisk/realRisk oranı) — bu
  //      sayıların ortalaması istatistiksel olarak anlamsızdı.
  // Artık simEntry stop'un ötesindeyse (fiilen doldurulamazdı) simPnlR NULL döner.

  it('LONG tp_hit: risk entryPrice-stopPrice üzerinden (sabit birim), fee düşer', () => {
    // entry=1000, stop=900 → riskUnit=100 (SABİT, simEntry'den bağımsız)
    const r = evaluateSimOutcome({
      direction: 'long',
      entryPrice: 1000,
      simEntry: 1010,
      stopPrice: 900,
      targetPrice: 1150,
      status: 'tp_hit',
      exitPrice: 1150,
      takerFee,
    });
    const riskUnit = 100;
    const grossR = (1150 - 1010) / riskUnit;
    const feeR = (2 * takerFee * 1010) / riskUnit;
    expect(r.simPnlR).toBeCloseTo(grossR - feeR, 4);
  });

  it('LONG sl_hit: negatif simPnlR, fee dahil, sabit riskUnit', () => {
    const r = evaluateSimOutcome({
      direction: 'long',
      entryPrice: 1000,
      simEntry: 1010,
      stopPrice: 900,
      targetPrice: 1150,
      status: 'sl_hit',
      exitPrice: 900,
      takerFee,
    });
    const riskUnit = 100;
    const grossR = (900 - 1010) / riskUnit;
    const feeR = (2 * takerFee * 1010) / riskUnit;
    expect(r.simPnlR).toBeCloseTo(grossR - feeR, 4);
  });

  it('SHORT tp_hit: yön ters çevrilir, sabit riskUnit', () => {
    const r = evaluateSimOutcome({
      direction: 'short',
      entryPrice: 1000,
      simEntry: 990,
      stopPrice: 1100,
      targetPrice: 850,
      status: 'tp_hit',
      exitPrice: 850,
      takerFee,
    });
    const riskUnit = 100; // |entryPrice - stopPrice|
    const grossR = -1 * (850 - 990) / riskUnit;
    const feeR = (2 * takerFee * 990) / riskUnit;
    expect(r.simPnlR).toBeCloseTo(grossR - feeR, 4);
  });

  it('timeout: exitPrice (close) ile hesaplar', () => {
    const r = evaluateSimOutcome({
      direction: 'long',
      entryPrice: 1000,
      simEntry: 1000,
      stopPrice: 900,
      targetPrice: 1150,
      status: 'timeout',
      exitPrice: 1020,
      takerFee,
    });
    expect(r.simPnlR).not.toBeNull();
  });

  it('sıfır risk durumunda (entryPrice === stopPrice) simPnlR null döner', () => {
    const r = evaluateSimOutcome({
      direction: 'long',
      entryPrice: 900,
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
      entryPrice: 1000,
      simEntry: null,
      stopPrice: 900,
      targetPrice: 1150,
      status: 'tp_hit',
      exitPrice: 1150,
      takerFee,
    });
    expect(r.simPnlR).toBeNull();
  });

  // --- B1 regresyon: simEntry stop'un ÖTESİNDE → doldurulamaz sayılmalı ---
  describe('unfillable simEntry (B1 işaret hatası regresyonu)', () => {
    it('LONG: simEntry stop seviyesinin AŞAĞISINDA (stop-through) → simPnlR null', () => {
      // Canlı DB'de gözlenen desen: TACUSDT long, entry=0.03350, stop=0.033096,
      // sim_entry=0.004350 (stop'un çok altında) — Math.abs eskiden bunu +0.9998 yazıyordu.
      const r = evaluateSimOutcome({
        direction: 'long',
        entryPrice: 0.03350,
        simEntry: 0.004350,
        stopPrice: 0.033096,
        targetPrice: 0.03500,
        status: 'sl_hit',
        exitPrice: 0.033096,
        takerFee,
      });
      expect(r.simPnlR).toBeNull();
      expect(r.reason).toBe('unfillable');
    });

    it('SHORT: simEntry stop seviyesinin ÜSTÜNDE → simPnlR null', () => {
      const r = evaluateSimOutcome({
        direction: 'short',
        entryPrice: 1.14700,
        simEntry: 3.386984,
        stopPrice: 1.221137,
        targetPrice: 1.00000,
        status: 'sl_hit',
        exitPrice: 1.221137,
        takerFee,
      });
      expect(r.simPnlR).toBeNull();
      expect(r.reason).toBe('unfillable');
    });

    it('LONG: simEntry tam stop seviyesinde → unfillable (sıfır/negatif risk)', () => {
      const r = evaluateSimOutcome({
        direction: 'long',
        entryPrice: 1000,
        simEntry: 900,
        stopPrice: 900,
        targetPrice: 1150,
        status: 'sl_hit',
        exitPrice: 900,
        takerFee,
      });
      expect(r.simPnlR).toBeNull();
    });

    it('LONG: simEntry stop ile entry arasında (normal aralık) → doldurulabilir, hesaplanır', () => {
      const r = evaluateSimOutcome({
        direction: 'long',
        entryPrice: 1000,
        simEntry: 950,
        stopPrice: 900,
        targetPrice: 1150,
        status: 'sl_hit',
        exitPrice: 900,
        takerFee,
      });
      expect(r.simPnlR).not.toBeNull();
      expect(r.simPnlR).toBeLessThan(0);
    });
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
        entryPrice: 1000,
        simEntry: 1010,
        stopPrice: 900,
        targetPrice: 1150,
        status: 'sl_hit',
        exitPrice: 900,
        takerFee,
      };
      const withSlip = evaluateSimOutcome({ ...args, exitSlippagePct });
      const without = evaluateSimOutcome(args);

      const riskUnit = 100;
      const realExit = 900 * (1 - exitSlippagePct); // long stop → aşağı kayar
      const grossR = (realExit - 1010) / riskUnit;
      const feeR = (2 * takerFee * 1010) / riskUnit;

      expect(withSlip.simPnlR).toBeCloseTo(grossR - feeR, 4);
      expect(withSlip.simPnlR).toBeLessThan(without.simPnlR);
    });

    it('SHORT sl_hit: çıkış stop seviyesinin ÜSTÜNDE dolar (aleyhe)', () => {
      const withSlip = evaluateSimOutcome({
        direction: 'short',
        entryPrice: 1000,
        simEntry: 990,
        stopPrice: 1100,
        targetPrice: 850,
        status: 'sl_hit',
        exitPrice: 1100,
        takerFee,
        exitSlippagePct,
      });

      const riskUnit = 100;
      const realExit = 1100 * (1 + exitSlippagePct); // short stop → yukarı kayar
      const grossR = -1 * (realExit - 990) / riskUnit;
      const feeR = (2 * takerFee * 990) / riskUnit;

      expect(withSlip.simPnlR).toBeCloseTo(grossR - feeR, 4);
    });

    it('tp_hit: limit emirle dolar, kayma UYGULANMAZ', () => {
      const args = {
        direction: 'long',
        entryPrice: 1000,
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
        entryPrice: 1000,
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
        entryPrice: 1000,
        simEntry: 1010,
        stopPrice: 900,
        targetPrice: 1150,
        status: 'sl_hit',
        exitPrice: 900,
        takerFee,
      };
      const riskUnit = 100;
      const expected = (900 - 1010) / riskUnit - (2 * takerFee * 1010) / riskUnit;
      expect(evaluateSimOutcome(args).simPnlR).toBeCloseTo(expected, 4);
    });
  });
});

describe('isSimEntryFillable (Faz 0.2, B2 düzeltmesi)', () => {
  const signalCreatedAt = new Date('2026-08-20T10:00:00Z').toISOString();

  it('sinyal zamanına yakın, taze 1m mum → doldurulabilir', () => {
    const candleTs = new Date('2026-08-20T10:01:00Z').getTime();
    const now = new Date('2026-08-20T10:01:30Z').getTime();
    expect(isSimEntryFillable({ signalCreatedAt, candleTs, tf: '1m', now })).toBe(true);
  });

  it('mum sinyalden ÖNCEyse reddedilir', () => {
    const candleTs = new Date('2026-08-20T09:59:00Z').getTime();
    const now = new Date('2026-08-20T10:01:00Z').getTime();
    expect(isSimEntryFillable({ signalCreatedAt, candleTs, tf: '1m', now })).toBe(false);
  });

  it('mum "şimdi"ye göre tfMs×2\'den eskiyse (bayat) reddedilir — B2 regresyonu', () => {
    // 1m için tfMs=60_000, eşik=120_000ms. Canlı DB'de gözlenen desen:
    // haftalarca eski pending satır güncel bir mumla eşleşiyordu (%4.97 ortalama sapma).
    const candleTs = new Date('2026-08-20T10:01:00Z').getTime();
    const now = new Date('2026-08-27T10:01:00Z').getTime(); // 7 gün sonra
    expect(isSimEntryFillable({ signalCreatedAt, candleTs, tf: '1m', now })).toBe(false);
  });

  it('tam eşikte (tfMs×2) kabul, hemen üstünde ret — 1m sınır testi', () => {
    const candleTs = new Date('2026-08-20T10:01:00Z').getTime();
    const atThreshold = candleTs + TF_MS_1M * 2;
    const overThreshold = atThreshold + 1;
    expect(isSimEntryFillable({ signalCreatedAt, candleTs, tf: '1m', now: atThreshold })).toBe(true);
    expect(isSimEntryFillable({ signalCreatedAt, candleTs, tf: '1m', now: overThreshold })).toBe(false);
  });

  it('5m mumda daha geniş tolerans (tfMs×2 = 10dk)', () => {
    const candleTs = new Date('2026-08-20T10:01:00Z').getTime();
    const now = candleTs + 9 * 60_000; // 9dk sonra — hâlâ 10dk eşiğinin altında
    expect(isSimEntryFillable({ signalCreatedAt, candleTs, tf: '5m', now })).toBe(true);
  });

  it('candleTs verilmemişse (eski entegrasyon) geriye uyumlu true döner', () => {
    expect(isSimEntryFillable({ signalCreatedAt, candleTs: null, tf: '1m' })).toBe(true);
    expect(isSimEntryFillable({ signalCreatedAt, candleTs: undefined, tf: '1m' })).toBe(true);
  });

  it('tf belirtilmemişse 1m varsayılanı kullanılır', () => {
    const candleTs = new Date('2026-08-20T10:01:00Z').getTime();
    const now = candleTs + 121_000; // 1m eşiğinin (120s) üstünde
    expect(isSimEntryFillable({ signalCreatedAt, candleTs, now })).toBe(false);
  });
});
