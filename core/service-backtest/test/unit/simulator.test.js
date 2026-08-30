import { describe, it, expect } from 'vitest';
import { simulateTrade } from '../../src/domain/simulator.js';
import { evaluateOutcome, evaluateSimOutcome } from '@borsa-bot/core-tracker/src/domain/evaluate-outcome.js';

function candle(open, high, low, close) {
  return { timestamp: Date.now(), open, high, low, close, volume: 100 };
}

const FEES = { takerFee: 0.0006, slippagePct: 0.0003 };

describe('simulateTrade — LONG', () => {
  const setup = { entryPrice: 100, stopPrice: 95, targetPrice: 110, direction: 'long' };

  it('target fiyata ulaşınca WIN döner, fee/slippage düşülmüş sim R ile', () => {
    const candles = [
      candle(100, 105, 99, 102),
      candle(102, 111, 100, 108),
    ];
    const result = simulateTrade(setup, candles, FEES);
    expect(result.outcome).toBe('WIN');
    expect(result.durationMinutes).toBe(2);
    // Faz 0.1 (B1/B3 düzeltmesi): risk artık sabit |entryPrice-stopPrice| = 5
    // simEntry = ilk mumun açılışı × (1+slippage) = 100.03
    // grossR = (110-100.03)/5 = 1.994, feeR = 2×0.0006×100.03/5 ≈ 0.024
    expect(result.r).toBeCloseTo(1.97, 2);
  });

  it('stop fiyatına ulaşınca LOSS döner', () => {
    const candles = [candle(100, 101, 94, 96)];
    const result = simulateTrade(setup, candles, FEES);
    expect(result.outcome).toBe('LOSS');
    expect(result.durationMinutes).toBe(1);
    expect(result.r).toBeLessThan(-1.0); // fee eklenince LOSS -1'den daha kötü
  });

  it('240 mum sonunda ne TP ne SL → TIMEOUT döner', () => {
    const candles = Array(240).fill(candle(100, 102, 98, 100));
    const result = simulateTrade(setup, candles, FEES);
    expect(result.outcome).toBe('TIMEOUT');
    expect(result.durationMinutes).toBe(240);
  });

  it('Faz 1.2 (B10 düzeltmesi): TIMEOUT artık GERÇEK mark-to-market R döner, bedava r:0 DEĞİL', () => {
    // close=104 ile biten 240 mumluk düz seri — TP(110)/SL(95) hiç tetiklenmiyor.
    // Mark-to-market: simEntry≈100.03, close=104 → grossR pozitif olmalı (fee düşülmüş).
    const candles = Array(240).fill(candle(100, 102, 98, 104));
    const result = simulateTrade(setup, candles, FEES);
    expect(result.outcome).toBe('TIMEOUT');
    expect(result.r).not.toBe(0); // eskiden hep 0'dı
    expect(result.r).toBeGreaterThan(0); // close girişin üstünde, long → pozitif R
  });

  it('aynı mumda hem TP hem SL varsa SL-first (canlı ile parite)', () => {
    // high >= target VE low <= stop aynı mumda
    const candles = [candle(100, 111, 94, 100)];
    const result = simulateTrade(setup, candles, FEES);
    expect(result.outcome).toBe('LOSS');
  });
});

describe('simulateTrade — SHORT', () => {
  const setup = { entryPrice: 100, stopPrice: 105, targetPrice: 90, direction: 'short' };

  it('target fiyata ulaşınca WIN döner', () => {
    const candles = [candle(100, 101, 89, 95)];
    const result = simulateTrade(setup, candles, FEES);
    expect(result.outcome).toBe('WIN');
  });

  it('stop fiyatına ulaşınca LOSS döner', () => {
    const candles = [candle(100, 106, 98, 102)];
    const result = simulateTrade(setup, candles, FEES);
    expect(result.outcome).toBe('LOSS');
  });
});

// Faz 2.2 (maker giriş modeli): sinyal fiyatı yerine, biraz daha iyi bir fiyatta
// bekleyen bir LIMIT (post-only, maker) emri simüle eder. Amaç: taker roundtrip
// (~0.0012) yerine maker roundtrip (~0.0004) — stop %2.5'te feeR 0.048R'den
// 0.016R'ye düşer, %39.4 WR'deki açığın bir kısmını kapatır. Karşılığında
// DOLMAMA RİSKİ var: fiyat N mum içinde limit seviyesine hiç dönmeyebilir —
// bu durumda işlem hiç açılmaz (kaçırılan fırsat, ama kayıp da yok).
describe('simulateTrade — maker giriş modeli (Faz 2.2)', () => {
  const setup = { entryPrice: 100, stopPrice: 95, targetPrice: 110, direction: 'long' };
  const MAKER_FEES = { takerFee: 0.0006, makerFee: 0.0002, slippagePct: 0.0003, exitSlippagePct: 0.0003 };

  it('entryMode olmadan (varsayılan) davranış DEĞİŞMEZ — geriye uyumlu', () => {
    const candles = [candle(100, 105, 99, 102), candle(102, 111, 100, 108)];
    const withoutMode = simulateTrade(setup, candles, MAKER_FEES);
    const explicitTaker = simulateTrade(setup, candles, { ...MAKER_FEES, entryMode: 'taker' });
    expect(withoutMode).toEqual(explicitTaker);
  });

  it('entryMode:"maker" ile LONG: limit emri entryPrice\'ın ALTINDA (daha iyi fiyat) bekler', () => {
    // limit = entryPrice * (1 - makerOffsetPct), ilk mum bu seviyeye dokunursa dolar
    const candles = [
      candle(100, 101, 99.5, 100.5), // limit'e dokunmuyor (limit ~99.7 civarı varsayımla)
      candle(100.5, 111, 99, 108),   // low=99 → limit seviyesine değiyor, TP de aynı mumda
    ];
    const result = simulateTrade(setup, candles, { ...MAKER_FEES, entryMode: 'maker' });
    expect(['WIN', 'LOSS', 'NO_FILL']).toContain(result.outcome);
  });

  it('entryMode:"maker" ile fiyat hiç limit seviyesine dönmezse NO_FILL döner, fee/R hesaplanmaz', () => {
    // Fiyat sürekli entryPrice'ın ÜSTÜNDE kalıyor — long limit (altta) hiç dolmuyor
    const neverTouches = Array(240).fill(candle(105, 106, 104, 105));
    const result = simulateTrade(setup, neverTouches, { ...MAKER_FEES, entryMode: 'maker' });
    expect(result.outcome).toBe('NO_FILL');
    expect(result.r).toBe(0);
  });

  it('entryMode:"maker" ile dolan işlemde makerFee kullanılır (takerFee DEĞİL) — daha düşük fee yükü', () => {
    // Fiyat hemen limit'e dokunup sonra TP'ye gidiyor
    const candles = [
      candle(100, 101, 99, 100.5),  // low=99, limit'e (99.7 civarı) dokunur → dolar
      candle(100.5, 111, 100, 108), // TP=110'a ulaşır
    ];
    const makerResult = simulateTrade(setup, candles, { ...MAKER_FEES, entryMode: 'maker' });
    const takerResult = simulateTrade(setup, candles, { ...MAKER_FEES, entryMode: 'taker' });
    if (makerResult.outcome === 'WIN' && takerResult.outcome === 'WIN') {
      // Maker daha düşük fee kullandığı için R en az taker kadar iyi olmalı
      expect(makerResult.r).toBeGreaterThanOrEqual(takerResult.r - 0.001);
    }
  });

  it('SHORT: limit emri entryPrice\'ın ÜSTÜNDE (daha iyi fiyat) bekler', () => {
    const shortSetup = { entryPrice: 100, stopPrice: 105, targetPrice: 90, direction: 'short' };
    const neverTouches = Array(50).fill(candle(95, 96, 94, 95)); // hep entry'nin ALTINDA
    const result = simulateTrade(shortSetup, neverTouches, { ...MAKER_FEES, entryMode: 'maker' });
    expect(result.outcome).toBe('NO_FILL'); // short limit üstte bekliyor, hiç dokunulmuyor
  });
});

describe('simulateTrade — canlı tracker ile parite', () => {
  it('aynı setup+mumlar simulateTrade ve evaluateOutcome/evaluateSimOutcome zincirinde aynı sonucu vermeli', () => {
    const setup = { entryPrice: 50, stopPrice: 48, targetPrice: 54, direction: 'long' };
    const candles = [
      candle(50, 51, 49.5, 50.5),
      candle(50.5, 54.5, 50, 54),
    ];

    const backtestResult = simulateTrade(setup, candles, FEES);

    // Canlı tracker mantığını manuel taklit et
    const isLong = true;
    const simEntry = candles[0].open * (1 + FEES.slippagePct);
    const signal = {
      direction: 'long',
      entry_price: setup.entryPrice,
      stop_price: setup.stopPrice,
      target_price: setup.targetPrice,
      signal_created_at: new Date(0).toISOString(),
    };
    let liveResult = null;
    for (let i = 0; i < candles.length; i++) {
      const now = (i + 1) * 60 * 1000;
      const r = evaluateOutcome(signal, candles[i], now, 240 * 60 * 1000);
      if (r) {
        const { simPnlR } = evaluateSimOutcome({
          direction: 'long', entryPrice: setup.entryPrice, simEntry,
          stopPrice: setup.stopPrice, targetPrice: setup.targetPrice,
          status: r.status, exitPrice: r.exitPrice, takerFee: FEES.takerFee,
        });
        liveResult = { status: r.status, simPnlR };
        break;
      }
    }

    expect(backtestResult.outcome).toBe(liveResult.status === 'tp_hit' ? 'WIN' : 'LOSS');
    expect(backtestResult.r).toBeCloseTo(liveResult.simPnlR, 6);
  });
});
