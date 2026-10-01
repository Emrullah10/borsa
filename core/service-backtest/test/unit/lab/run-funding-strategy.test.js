import { describe, it, expect } from 'vitest';
import { runFundingStrategy } from '../../../src/domain/lab/run-funding-strategy.js';

const H = 3_600_000;
const T0 = 1_700_000_000_000 - (1_700_000_000_000 % H); // saat başına hizalı

// Sabit fiyatlı 1h mumlar: TR = 2 → ATR ≈ 2. stopAtrMult=3 → risk=6.
const flat = (n, price = 100, start = T0) => Array.from({ length: n }, (_, i) => ({
  timestamp: start + i * H, open: price, high: price + 1, low: price - 1, close: price, volume: 1,
}));
const ARGS = { symbol: 'TESTUSDT', holdHours: 10, stopAtrMult: 3, rank: 5, fundingSeries: [] };

describe('runFundingStrategy — giriş zamanlaması (sızıntı yok)', () => {
  it('giriş, sinyal anından SONRAKİ ilk 1h mumun açılışıdır (1 saat gecikme)', () => {
    const candles = flat(60);
    const sigTs = T0 + 30 * H; // tam bir mumun açılış anı
    const [t] = runFundingStrategy({ ...ARGS, candles1h: candles, signals: [{ timestamp: sigTs, direction: 'short' }] });
    expect(t.timestamp).toBe(sigTs + H);          // aynı mum DEĞİL, sonraki
    expect(t.entryPrice).toBe(100);
  });

  it('ATR yalnız giriş mumundan ÖNCEKİ mumlarla hesaplanır (sonrası değişince stop aynı kalır)', () => {
    const a = flat(60);
    const b = flat(60).map((c, i) => (i >= 31 ? { ...c, high: c.high + 50, low: c.low - 50 } : c)); // giriş mumu (31) ve sonrası şişirildi
    const sig = [{ timestamp: T0 + 30 * H, direction: 'long' }];
    const [ta] = runFundingStrategy({ ...ARGS, candles1h: a, signals: sig });
    const [tb] = runFundingStrategy({ ...ARGS, candles1h: b, signals: sig });
    expect(tb.stopPrice).toBe(ta.stopPrice);
  });

  it('stop = giriş ∓ stopAtrMult × ATR (long altta, short üstte)', () => {
    const c = flat(60);
    const [l] = runFundingStrategy({ ...ARGS, candles1h: c, signals: [{ timestamp: T0 + 30 * H, direction: 'long' }] });
    const [s] = runFundingStrategy({ ...ARGS, candles1h: c, signals: [{ timestamp: T0 + 30 * H, direction: 'short' }] });
    expect(l.stopPrice).toBeCloseTo(94, 1);
    expect(s.stopPrice).toBeCloseTo(106, 1);
  });
});

describe('runFundingStrategy — çıkışlar', () => {
  it('stop vurulursa LOSS ve r ≈ −1R (maliyet dahil biraz daha kötü)', () => {
    const c = flat(60).map((x, i) => (i === 33 ? { ...x, low: 80, close: 82 } : x));
    const [t] = runFundingStrategy({ ...ARGS, candles1h: c, signals: [{ timestamp: T0 + 30 * H, direction: 'long' }] });
    expect(t.outcome).toBe('LOSS');
    expect(t.rPrice).toBeLessThan(-1);
    expect(t.rPrice).toBeGreaterThan(-1.5);
  });

  it('düz fiyatta TIMEOUT: süre = holdHours, r küçük negatif (sadece maliyet), bedava 0 değil', () => {
    const [t] = runFundingStrategy({ ...ARGS, candles1h: flat(60), signals: [{ timestamp: T0 + 30 * H, direction: 'short' }] });
    expect(t.outcome).toBe('TIMEOUT');
    expect(t.exitTs - t.timestamp).toBe(10 * H);
    expect(t.rPrice).toBeLessThan(0);
    expect(t.rPrice).toBeGreaterThan(-0.2);
  });

  it('veri sonunda tam tutma penceresi yoksa işlem atlanır (bedava timeout yok)', () => {
    const trades = runFundingStrategy({ ...ARGS, candles1h: flat(40), signals: [{ timestamp: T0 + 35 * H, direction: 'long' }] });
    expect(trades).toHaveLength(0);
  });

  it('pozisyon açıkken gelen sinyal yok sayılır, sonrakine izin verilir', () => {
    const sigs = [
      { timestamp: T0 + 30 * H, direction: 'long' },
      { timestamp: T0 + 33 * H, direction: 'long' }, // 1. işlem 31→41 arası açık
      { timestamp: T0 + 45 * H, direction: 'short' },
    ];
    const trades = runFundingStrategy({ ...ARGS, candles1h: flat(80), signals: sigs });
    expect(trades.map((t) => t.direction)).toEqual(['long', 'short']);
  });
});

describe('runFundingStrategy — funding PnL', () => {
  it('SHORT + pozitif funding → fundingR > 0 ve r = rPrice + fundingR', () => {
    const fundingSeries = [{ timestamp: T0 + 36 * H, rate: 0.001 }];
    const [t] = runFundingStrategy({ ...ARGS, candles1h: flat(60), fundingSeries, signals: [{ timestamp: T0 + 30 * H, direction: 'short' }] });
    expect(t.fundingR).toBeGreaterThan(0);
    // fraction = +0.001, stopPct = 6/100 → fundingR = 0.001 / 0.06
    expect(t.fundingR).toBeCloseTo(0.001 / 0.06, 3);
    expect(t.r).toBeCloseTo(t.rPrice + t.fundingR, 10);
  });

  it('LONG + pozitif funding → fundingR < 0', () => {
    const fundingSeries = [{ timestamp: T0 + 36 * H, rate: 0.001 }];
    const [t] = runFundingStrategy({ ...ARGS, candles1h: flat(60), fundingSeries, signals: [{ timestamp: T0 + 30 * H, direction: 'long' }] });
    expect(t.fundingR).toBeLessThan(0);
  });

  it('tutma penceresi DIŞINDAki funding sayılmaz', () => {
    const fundingSeries = [{ timestamp: T0 + 20 * H, rate: 0.01 }, { timestamp: T0 + 50 * H, rate: 0.01 }];
    const [t] = runFundingStrategy({ ...ARGS, candles1h: flat(60), fundingSeries, signals: [{ timestamp: T0 + 30 * H, direction: 'short' }] });
    expect(t.fundingR).toBe(0);
  });
});

describe('runFundingStrategy — maliyet stresi', () => {
  it('costMultiplier=2 aynı işlemde r\'yi düşürür', () => {
    const sig = [{ timestamp: T0 + 30 * H, direction: 'long' }];
    const [a] = runFundingStrategy({ ...ARGS, candles1h: flat(60), signals: sig });
    const [b] = runFundingStrategy({ ...ARGS, candles1h: flat(60), signals: sig, costMultiplier: 2 });
    expect(b.rPrice).toBeLessThan(a.rPrice);
  });
});
