import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitRealFill, calcSlippageDiff } from './realFillApi.js';

describe('submitRealFill', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('outcomeId ile doğru endpoint\'e POST atar', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    await submitRealFill('abc-123', { realEntryPrice: 2.57 });

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toContain('/outcomes/abc-123/real-fill');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({ realEntryPrice: 2.57 });
  });

  it('boş string fiyatları göndermez (backend 400 döner)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    await submitRealFill('abc-123', { realEntryPrice: 2.57, realExitPrice: '' });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('realExitPrice');
  });

  it('outcomeId yoksa istek atmaz, hata döner', async () => {
    const r = await submitRealFill(null, { realEntryPrice: 2.57 });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  it('her iki fiyat da boşsa istek atmaz', async () => {
    const r = await submitRealFill('abc-123', {});
    expect(global.fetch).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  it('sunucu hatasında ok:false döner, exception fırlatmaz', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    const r = await submitRealFill('abc-123', { realEntryPrice: 2.57 });
    expect(r.ok).toBe(false);
  });

  it('ağ hatasında çökmez', async () => {
    global.fetch.mockRejectedValue(new Error('network'));
    const r = await submitRealFill('abc-123', { realEntryPrice: 2.57 });
    expect(r.ok).toBe(false);
  });
});

describe('calcSlippageDiff', () => {
  it('LONG: gerçek giriş modelden YÜKSEKSE aleyhe (pozitif)', () => {
    expect(calcSlippageDiff({ direction: 'long', simEntryPrice: 100, realEntryPrice: 100.5 }))
      .toBeCloseTo(0.5, 4);
  });

  it('LONG: gerçek giriş modelden DÜŞÜKSE lehe (negatif)', () => {
    expect(calcSlippageDiff({ direction: 'long', simEntryPrice: 100, realEntryPrice: 99.5 }))
      .toBeCloseTo(-0.5, 4);
  });

  it('SHORT: gerçek giriş modelden DÜŞÜKSE aleyhe (pozitif)', () => {
    expect(calcSlippageDiff({ direction: 'short', simEntryPrice: 100, realEntryPrice: 99.5 }))
      .toBeCloseTo(0.5, 4);
  });

  it('veri eksikse null döner', () => {
    expect(calcSlippageDiff({ direction: 'long', simEntryPrice: null, realEntryPrice: 100 })).toBeNull();
    expect(calcSlippageDiff({ direction: 'long', simEntryPrice: 100, realEntryPrice: null })).toBeNull();
  });
});
