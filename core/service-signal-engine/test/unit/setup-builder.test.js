import { describe, it, expect } from 'vitest';
import { buildSetup, applySRCap } from '../../src/domain/setup-builder.js';

// --- applySRCap testleri (değişmedi) ---

describe('applySRCap', () => {
  it('long: direnç hedeften yakınsa hedefi sınırlar', () => {
    const result = applySRCap('long', 100, 110, 95, null, 106);
    expect(result.cappedTarget).toBe(106);
    expect(result.srCapped).toBe(true);
    expect(result.cappedRR).toBeCloseTo(1.2);
  });

  it('long: direnç hedeften uzaksa değişiklik yok', () => {
    const result = applySRCap('long', 100, 110, 95, null, 115);
    expect(result.cappedTarget).toBe(110);
    expect(result.srCapped).toBe(false);
  });

  it('short: destek hedeften yakınsa hedefi sınırlar', () => {
    const result = applySRCap('short', 100, 90, 105, 94, null);
    expect(result.cappedTarget).toBe(94);
    expect(result.srCapped).toBe(true);
    expect(result.cappedRR).toBeCloseTo(1.2);
  });

  it('short: destek hedeften uzaksa değişiklik yok', () => {
    const result = applySRCap('short', 100, 90, 105, 85, null);
    expect(result.cappedTarget).toBe(90);
    expect(result.srCapped).toBe(false);
  });

  it('S/R null ise değişiklik yok', () => {
    const result = applySRCap('long', 100, 110, 95, null, null);
    expect(result.cappedTarget).toBe(110);
    expect(result.srCapped).toBe(false);
  });
});

// --- buildSetup entegrasyon testleri ---

describe('buildSetup', () => {
  // currentPrice=100, atr=2 → stopDist=3, stop=97, target=100+3×1.8=105.4
  // stopPct = 3/100 = 3% > 1.2% → meetsFeeFloor=true

  it('long: stop below entry, target above entry', () => {
    const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2 });
    expect(setup.entryPrice).toBe(100);
    expect(setup.stopPrice).toBeLessThan(100);
    expect(setup.targetPrice).toBeGreaterThan(100);
    expect(setup.direction).toBe('long');
  });

  it('short: stop above entry, target below entry', () => {
    const setup = buildSetup({ direction: 'short', currentPrice: 100, atr: 2 });
    expect(setup.stopPrice).toBeGreaterThan(100);
    expect(setup.targetPrice).toBeLessThan(100);
    expect(setup.direction).toBe('short');
  });

  it('sabit R/R = 1.2 (tuned default)', () => {
    const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2 });
    expect(setup.dynamicRR).toBe(1.2);
    expect(setup.rrRatio).toBeCloseTo(1.2, 1);
  });

  it('farklı parametrelerle de dynamicRR sabit 1.2', () => {
    const a = buildSetup({ direction: 'long', currentPrice: 50000, atr: 500 });
    const b = buildSetup({ direction: 'short', currentPrice: 100, atr: 0.5 });
    expect(a.dynamicRR).toBe(1.2);
    expect(b.dynamicRR).toBe(1.2);
  });

  it('S/R cap: direnç hedefi kısaltır', () => {
    // stop=95, target=106 — resistance=103 araya giriyor
    const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2, resistanceLevel: 103 });
    expect(setup.targetPrice).toBe(103);
    expect(setup.srCapped).toBe(true);
    expect(setup.rrRatio).toBeLessThan(1.2);
  });

  it('S/R cap sonrası R/R < 1.0 → meetsMinRR=false', () => {
    // resistance=101 → reward=1, risk=5 → R/R=0.2
    const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2, resistanceLevel: 101 });
    expect(setup.meetsMinRR).toBe(false);
    expect(setup.rrRatio).toBeLessThan(1.0);
  });

  it('S/R cap yok → meetsMinRR=true', () => {
    const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2 });
    expect(setup.meetsMinRR).toBe(true);
    expect(setup.srCapped).toBe(false);
  });

  it('yüksek ATR → meetsMinTarget=true', () => {
    const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2 });
    expect(setup.meetsMinTarget).toBe(true);
    expect(setup.targetPct).toBeGreaterThanOrEqual(0.01);
  });

  it('düşük ATR → meetsMinTarget=false', () => {
    const setup = buildSetup({ direction: 'long', currentPrice: 100000, atr: 50 });
    expect(setup.meetsMinTarget).toBe(false);
  });

  it('fee floor: dar stop (%0.5) → meetsFeeFloor=false', () => {
    // currentPrice=1000, atr=2 → stopDist=5, stopPct=0.5% < 2.5%
    const setup = buildSetup({ direction: 'long', currentPrice: 1000, atr: 2 });
    expect(setup.stopPct).toBeLessThan(0.025);
    expect(setup.meetsFeeFloor).toBe(false);
  });

  it('fee floor: geniş stop (%5) → meetsFeeFloor=true', () => {
    // currentPrice=100, atr=2 → stopDist=5, stopPct=5% > 2.5%
    const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2 });
    expect(setup.stopPct).toBeGreaterThanOrEqual(0.025);
    expect(setup.meetsFeeFloor).toBe(true);
  });

  // --- Fee sabiti tutarlılığı (Faz 0.2) ---
  // Eski hal: FEE_ROUNDTRIP = 0.0008 hardcoded ve "maker" diye etiketliydi,
  // ama tüm dolumlar TAKER. Muhasebe tarafı (evaluateSimOutcome / getSignalStats)
  // 2*0.0006 = 0.0012 + kayma kullanıyordu → giriş kapısı muhasebeden ~%50 GEVŞEK,
  // yani kapının geçirdiği bazı setup'lar muhasebede zarar yazıyordu.
  describe('fee tutarlılığı', () => {
    it('feeRoundtrip parametre olarak geçirilebilir', () => {
      const ucuz = buildSetup({ direction: 'long', currentPrice: 1000, atr: 6, feeRoundtrip: 0.0008 });
      const pahali = buildSetup({ direction: 'long', currentPrice: 1000, atr: 6, feeRoundtrip: 0.0018 });
      expect(pahali.feeR).toBeGreaterThan(ucuz.feeR);
    });

    it('feeR = feeRoundtrip / stopPct', () => {
      const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2, feeRoundtrip: 0.0018 });
      expect(setup.feeR).toBeCloseTo(0.0018 / setup.stopPct, 6);
    });

    it('gerçekçi fee ile kapı daha SIKI: sınırdaki setup elenir', () => {
      // rrRatio - feeR >= 1.0 eşiğinde: yüksek fee feeR'yi büyütür → kapı kapanır
      const args = { direction: 'long', currentPrice: 1000, atr: 10, targetRR: 1.05 };
      const gevsek = buildSetup({ ...args, feeRoundtrip: 0.0008 });
      const gercek = buildSetup({ ...args, feeRoundtrip: 0.0018 });
      expect(gevsek.meetsFeeFloor).toBe(true);
      expect(gercek.meetsFeeFloor).toBe(false);
    });

    it('feeRoundtrip verilmezse eski davranış korunur (geriye uyumlu)', () => {
      const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2 });
      expect(setup.feeR).toBeCloseTo(0.0008 / setup.stopPct, 6);
    });
  });

  it('minStopPct override: 1m daha sıkı eşik', () => {
    const setup5m = buildSetup({ direction: 'long', currentPrice: 100, atr: 2, minStopPct: 0.012 });
    const setup1m = buildSetup({ direction: 'long', currentPrice: 100, atr: 2, minStopPct: 0.014 });
    // stopPct=%3 → her iki eşiği de geçmeli (atr=2 yeterince büyük)
    expect(setup5m.meetsFeeFloor).toBe(true);
    expect(setup1m.meetsFeeFloor).toBe(true);
  });

  it('stopPct ve feeR return objesinde dönüyor', () => {
    const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2 });
    expect(setup).toHaveProperty('stopPct');
    expect(setup).toHaveProperty('feeR');
    expect(setup).toHaveProperty('meetsFeeFloor');
    expect(setup).toHaveProperty('dynamicRR');
    expect(setup).toHaveProperty('srCapped');
  });

  it('targetPct doğru hesaplanır', () => {
    const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2 });
    const expected = Math.abs(setup.targetPrice - setup.entryPrice) / setup.entryPrice;
    expect(Math.abs(setup.targetPct - expected)).toBeLessThan(1e-10);
  });

  // Canlı veri: S/R-kapaklı (RR~1.5) sinyaller %45.7 WR, S/R'sız "açık sahada"
  // (RR~1.8, kapaksız) sinyaller sadece %33 WR (2026-07-13 kırılım analizi).
  describe('requireSrCap — S/R kapaksız sinyalleri eleme (opsiyonel gate)', () => {
    it('requireSrCap verilmezse meetsSrCapRequirement her zaman true (davranış-koruma)', () => {
      const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2 });
      expect(setup.srCapped).toBe(false);
      expect(setup.meetsSrCapRequirement).toBe(true);
    });

    it('requireSrCap=true + srCapped=false → meetsSrCapRequirement=false', () => {
      const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2, requireSrCap: true });
      expect(setup.srCapped).toBe(false);
      expect(setup.meetsSrCapRequirement).toBe(false);
    });

    it('requireSrCap=true + srCapped=true → meetsSrCapRequirement=true', () => {
      const setup = buildSetup({
        direction: 'long', currentPrice: 100, atr: 2, resistanceLevel: 103, requireSrCap: true,
      });
      expect(setup.srCapped).toBe(true);
      expect(setup.meetsSrCapRequirement).toBe(true);
    });
  });

  describe('atrStopMult / targetRR parametreleri (sweep için, davranış-koruyucu default)', () => {
    it('parametre verilmezse default (2.5 / 1.2) kullanılır', () => {
      const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2 });
      expect(setup.stopDist).toBe(5); // atr(2) * 2.5
      expect(setup.dynamicRR).toBe(1.2);
    });

    it('atrStopMult override edilirse stop mesafesi değişir', () => {
      const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2, atrStopMult: 1.0 });
      expect(setup.stopDist).toBe(2); // atr(2) * 1.0
    });

    it('targetRR override edilirse hedef mesafesi ve dynamicRR değişir', () => {
      const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2, targetRR: 1.2 });
      expect(setup.dynamicRR).toBe(1.2);
      expect(setup.rrRatio).toBeCloseTo(1.2, 1);
    });
  });
});
