import { describe, it, expect } from 'vitest';
import { backfillOutcome } from '../../src/domain/backfill-outcome.js';

const FEES = { takerFee: 0.0006, slippagePct: 0.0003 };
const TIMEOUT_MS = 4 * 60 * 60 * 1000;

function candle(ts, open, high, low, close) {
  return { timestamp: ts, open, high, low, close };
}

describe('backfillOutcome', () => {
  const base = {
    direction: 'long',
    entry_price: '1000',
    stop_price: '900',
    target_price: '1150',
    sim_entry_price: null,
    signal_created_at: new Date(1_000_000).toISOString(),
  };

  it('kaçırılan mumlar arasında TP tetiklenmişse resolved döner ve simEntry hesaplar', () => {
    const candles = [
      candle(1_060_000, 1010, 1020, 1005, 1015),
      candle(1_120_000, 1015, 1160, 1010, 1140),
    ];
    const { simEntry, resolved } = backfillOutcome(base, candles, 2_000_000, TIMEOUT_MS, FEES);

    expect(simEntry).toBeCloseTo(1010 * 1.0003, 5);
    expect(resolved).not.toBeNull();
    expect(resolved.status).toBe('tp_hit');
    expect(resolved.simPnlR).toBeGreaterThan(0);
  });

  it('sim_entry_price zaten varsa yeniden hesaplamaz, mevcut değeri kullanır', () => {
    const outcome = { ...base, sim_entry_price: '999' };
    const candles = [candle(1_060_000, 1010, 1020, 1005, 1015)];
    const { simEntry, resolved } = backfillOutcome(outcome, candles, 2_000_000, TIMEOUT_MS, FEES);
    expect(simEntry).toBe(999);
    expect(resolved).toBeNull(); // aralıkta ne TP ne SL
  });

  it('hiçbir mumda TP/SL tetiklenmezse resolved null, simEntry yine hesaplanır', () => {
    const candles = [candle(1_060_000, 1000, 1010, 995, 1005)];
    const { simEntry, resolved } = backfillOutcome(base, candles, 2_000_000, TIMEOUT_MS, FEES);
    expect(simEntry).not.toBeNull();
    expect(resolved).toBeNull();
  });

  it('mum listesi boşsa simEntry null, resolved null döner', () => {
    const { simEntry, resolved } = backfillOutcome(base, [], 2_000_000, TIMEOUT_MS, FEES);
    expect(simEntry).toBeNull();
    expect(resolved).toBeNull();
  });

  it('aynı mumda hem TP hem SL varsa SL-first (canlı ile parite)', () => {
    const candles = [candle(1_060_000, 1000, 1160, 800, 950)];
    const { resolved } = backfillOutcome(base, candles, 2_000_000, TIMEOUT_MS, FEES);
    expect(resolved.status).toBe('sl_hit');
    expect(resolved.tieBreak).toBe(true);
  });
});
