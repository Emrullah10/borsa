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
    // simEntry = ilk mumun açılışı × (1+slippage) = 100.03
    // simRisk = |100.03 - 95| = 5.03, grossR = (110-100.03)/5.03 ≈ 1.982
    // feeR = 2×0.0006×100.03/5.03 ≈ 0.0239
    expect(result.r).toBeCloseTo(1.958, 2);
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
          direction: 'long', simEntry,
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
