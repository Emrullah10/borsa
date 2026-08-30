import { describe, it, expect } from 'vitest';
import { runStrategyOverCandles } from '../../src/domain/run-strategy.js';
import { calcAllIndicators } from '@borsa-bot/core-signal-engine/src/domain/indicators.js';

// Yeterince uzun, dalgalı bir seri üretir — ADX/RSI/BB gibi göstergelerin
// non-null hesaplanabilmesi için en az WINDOW(60)+birkaç mum gerekir.
function makeCandles(n, seed = 100) {
  const out = [];
  let price = seed;
  for (let i = 0; i < n; i++) {
    // Deterministik ama dalgalı: sinüs + küçük trend
    price = seed + Math.sin(i / 5) * 8 + i * 0.05;
    const open = price;
    const close = price + (i % 3 === 0 ? 0.5 : -0.3);
    const high = Math.max(open, close) + 0.4;
    const low = Math.min(open, close) - 0.4;
    out.push({ timestamp: 1_700_000_000_000 + i * 60_000, open, high, low, close, volume: 100 + (i % 10) });
  }
  return out;
}

const flatRegimeBuffer = { at: () => [] }; // rejim verisi yok → 'neutral'
const flatHigherTfBuffer = { at: () => [] };

describe('runStrategyOverCandles', () => {
  it('yetersiz mumda boş trade listesi döner', () => {
    const trades = runStrategyOverCandles({
      candles: makeCandles(10),
      fundingHistory: [],
      regimeBuffer: flatRegimeBuffer,
      higherTfBuffer: flatHigherTfBuffer,
      window: 60,
      threshold: 0.65,
      symbol: 'TESTUSDT',
    });
    expect(trades).toEqual([]);
  });

  it('yeterli mumda trade listesi üretebilir (yapı doğru)', () => {
    const trades = runStrategyOverCandles({
      candles: makeCandles(300),
      fundingHistory: [],
      regimeBuffer: flatRegimeBuffer,
      higherTfBuffer: flatHigherTfBuffer,
      window: 60,
      threshold: 0.55, // düşük eşik — bu sentetik veride en az bir sinyal tetiklensin
      symbol: 'TESTUSDT',
    });
    // Trade üretilsin ya da üretilmesin, dönen yapı her zaman array olmalı
    expect(Array.isArray(trades)).toBe(true);
    if (trades.length > 0) {
      expect(trades[0]).toHaveProperty('symbol', 'TESTUSDT');
      expect(trades[0]).toHaveProperty('direction');
      expect(trades[0]).toHaveProperty('outcome');
      expect(trades[0]).toHaveProperty('regime');
    }
  });

  it('daha yüksek threshold ile eşit ya da daha az sinyal üretir', () => {
    const candles = makeCandles(300);
    const low = runStrategyOverCandles({
      candles, fundingHistory: [], regimeBuffer: flatRegimeBuffer, higherTfBuffer: flatHigherTfBuffer,
      window: 60, threshold: 0.55, symbol: 'TESTUSDT',
    });
    const high = runStrategyOverCandles({
      candles, fundingHistory: [], regimeBuffer: flatRegimeBuffer, higherTfBuffer: flatHigherTfBuffer,
      window: 60, threshold: 0.95, symbol: 'TESTUSDT',
    });
    expect(high.length).toBeLessThanOrEqual(low.length);
  });

  it('filterParams verilirse aşırı-uzama/adx filtreleri uygulanır (eşit ya da daha az sinyal)', () => {
    const candles = makeCandles(300);
    const noFilter = runStrategyOverCandles({
      candles, fundingHistory: [], regimeBuffer: flatRegimeBuffer, higherTfBuffer: flatHigherTfBuffer,
      window: 60, threshold: 0.55, symbol: 'TESTUSDT',
    });
    const strictFilter = runStrategyOverCandles({
      candles, fundingHistory: [], regimeBuffer: flatRegimeBuffer, higherTfBuffer: flatHigherTfBuffer,
      window: 60, threshold: 0.55, symbol: 'TESTUSDT',
      filterParams: { maxPbLong: 0.01, minPbShort: 0.99, rsiMaxLong: 1, rsiMinShort: 99, adxMax: 0 },
    });
    expect(strictFilter.length).toBeLessThanOrEqual(noFilter.length);
  });

  it('buildSetup çağrısına supportLevel/resistanceLevel geçirir — parite testi (S/R cap canlıdaki gibi uygulanmalı)', () => {
    // calcAllIndicators, ADX>=?? mumluk pencerede support/resistance üretir.
    // trade.srCapped alanı buildSetup'ın applySRCap sonucunu yansıtmalı; bu alan
    // olmadan (önceki bug) S/R hiç geçilmiyordu ve srCapped hep false kalıyordu.
    const candles = makeCandles(300);
    const trades = runStrategyOverCandles({
      candles, fundingHistory: [], regimeBuffer: flatRegimeBuffer, higherTfBuffer: flatHigherTfBuffer,
      window: 60, threshold: 0.55, symbol: 'TESTUSDT',
    });
    if (trades.length > 0) {
      expect(trades[0]).toHaveProperty('srCapped');
    }
  });

  it('TF/minStopPct parametresi buildSetup\'a geçirilir (varsayılan 1m fee-floor eşiği)', () => {
    const candles = makeCandles(300);
    const tradesDefault = runStrategyOverCandles({
      candles, fundingHistory: [], regimeBuffer: flatRegimeBuffer, higherTfBuffer: flatHigherTfBuffer,
      window: 60, threshold: 0.55, symbol: 'TESTUSDT',
    });
    const tradesLooseFloor = runStrategyOverCandles({
      candles, fundingHistory: [], regimeBuffer: flatRegimeBuffer, higherTfBuffer: flatHigherTfBuffer,
      window: 60, threshold: 0.55, symbol: 'TESTUSDT', minStopPct: 0.001,
    });
    // Daha gevşek fee-floor eşit ya da daha fazla sinyal üretmeli (asla daha az)
    expect(tradesLooseFloor.length).toBeGreaterThanOrEqual(tradesDefault.length);
  });

  // Faz 1.3 (B11 düzeltmesi): canlı make-process-candle.js `calcAllIndicators(candles)`
  // çağırırken `candles` KAPANAN mumu (closedCandle) İÇERİR — commitCandle onu buffer'a
  // ekledikten sonra çağrılır. Backtest ise `win = candles.slice(i-window, i)` ile
  // candles[i]'yi (mevcut/işlenen mum) DIŞLIYORDU — göstergeler canlıdan 1 bar geride
  // hesaplanıyordu ama giriş fiyatı yine de candles[i].close'du. Bu, ADX/RSI/BB/S-R gibi
  // seri-bağımlı tüm göstergeleri etkiliyordu.
  describe('gösterge penceresi paritesi (Faz 1.3, B11 düzeltmesi)', () => {
    it('üretilen trade\'in stopDist\'i candles[i] DAHİL pencereden hesaplanan ATR ile eşleşir (canlı parite)', () => {
      const candles = makeCandles(300);
      const window = 60;
      const trades = runStrategyOverCandles({
        candles, fundingHistory: [], regimeBuffer: flatRegimeBuffer, higherTfBuffer: flatHigherTfBuffer,
        window, threshold: 0.55, symbol: 'TESTUSDT', atrStopMult: 2.5,
      });
      expect(trades.length).toBeGreaterThan(0); // bu sentetik seri + eşikte en az bir sinyal beklenir

      for (const t of trades) {
        const i = candles.findIndex(c => c.timestamp === t.timestamp);
        expect(i).toBeGreaterThanOrEqual(window);

        // DOĞRU (canlı ile aynı) pencere: candles[i] DAHİL, son `window` mum
        const liveWindow = candles.slice(i - window + 1, i + 1);
        const liveAtr = calcAllIndicators(liveWindow).atr;
        const expectedStopDist = liveAtr * 2.5;
        const actualStopDist = Math.abs(t.entryPrice - t.stopPrice);

        expect(actualStopDist).toBeCloseTo(expectedStopDist, 6);
      }
    });
  });

  // Faz 2.5 (trigger TF sweep boyutu): canlıda 1m COOLDOWN_BY_TF=60dk, 5m=120dk
  // (make-process-candle.js). Backtest önceden 1m'e sabitlenmiş tek bir COOLDOWN_MS
  // kullanıyordu — 5m sweep'i doğru simüle edilemiyordu.
  it('cooldownMs parametresi verilirse KULLANILIR (varsayılan 60dk\'dan gerçekten farklı davranır)', () => {
    // Eşiği düşürüp veriyi yeterince yoğunlaştırarak varsayılan 60dk cooldown'un
    // ardışık sinyalleri fiilen bastırdığı bir senaryo kur — sonra çok kısa
    // (1dk) cooldown ile KESİN olarak daha FAZLA sinyal beklenmeli. Eğer
    // cooldownMs parametresi yoksayılıyorsa (implementasyon hatası) iki çalıştırma
    // aynı sinyal SAYISINI verir.
    const candles = makeCandles(300);
    const defaultCooldown = runStrategyOverCandles({
      candles, fundingHistory: [], regimeBuffer: flatRegimeBuffer, higherTfBuffer: flatHigherTfBuffer,
      window: 60, threshold: 0.5,
    });
    const veryShortCooldown = runStrategyOverCandles({
      candles, fundingHistory: [], regimeBuffer: flatRegimeBuffer, higherTfBuffer: flatHigherTfBuffer,
      window: 60, threshold: 0.5, cooldownMs: 60 * 1000, // 1dk — varsayılanın 1/60'ı
    });
    expect(veryShortCooldown.length).toBeGreaterThan(defaultCooldown.length);
  });

  it('atrStopMult/targetRR verilirse buildSetup\'a geçirilir (sweep parametreleri)', () => {
    const candles = makeCandles(300);
    const trades = runStrategyOverCandles({
      candles, fundingHistory: [], regimeBuffer: flatRegimeBuffer, higherTfBuffer: flatHigherTfBuffer,
      window: 60, threshold: 0.55, symbol: 'TESTUSDT', atrStopMult: 1.0, targetRR: 1.2,
    });
    if (trades.length > 0) {
      // rrRatio S/R cap olmadıkça targetRR'a yakın olmalı (1.2)
      const uncapped = trades.filter(t => !t.srCapped);
      if (uncapped.length > 0) {
        expect(uncapped[0].rrRatio).toBeCloseTo(1.2, 1);
      }
    }
  });
});
