import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeSignal } from './aiApi.js';

const SAMPLE_SIGNAL = {
  symbol: 'BTCUSDT',
  direction: 'long',
  entryPrice: 78420,
  stopPrice: 78180,
  targetPrice: 78780,
  rrRatio: 1.5,
  confluenceScore: 0.87,
  indicatorsSnapshot: { rsi: 28.4, ema9: 78450, ema21: 78380, macdHistogram: 0.12, atr: 240 },
};

describe('analyzeSignal', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => vi.restoreAllMocks());

  it('POST /analyze çağırır ve comment döner', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ comment: 'RSI aşırı satım bölgesinde.' }),
    });
    const result = await analyzeSignal(SAMPLE_SIGNAL);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/analyze'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toBe('RSI aşırı satım bölgesinde.');
  });

  it('fetch hatası durumunda null döner', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));
    const result = await analyzeSignal(SAMPLE_SIGNAL);
    expect(result).toBeNull();
  });

  it('comment null gelirse null döner', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ comment: null }),
    });
    const result = await analyzeSignal(SAMPLE_SIGNAL);
    expect(result).toBeNull();
  });
});
