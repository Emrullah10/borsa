import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRegime } from './regimeApi.js';

describe('fetchRegime', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('başarılı cevap → { regime, updatedAt } döner', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ regime: 'bull', updatedAt: '2026-06-04T10:00:00Z' }),
    });
    const result = await fetchRegime();
    expect(result.regime).toBe('bull');
  });

  it('hata → null döner', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network'));
    expect(await fetchRegime()).toBeNull();
  });

  it('ok=false → null döner', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    expect(await fetchRegime()).toBeNull();
  });
});
