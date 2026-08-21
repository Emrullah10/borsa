import { describe, it, expect } from 'vitest';
import { getEntryValidity, getEntryWindow } from './entryValidity.js';

const base = {
  triggerTimeframe: '1m',
  createdAt: new Date(1_000_000).toISOString(),
  direction: 'long',
  entryPrice: 100,
  stopPrice: 98, // risk = 2
};

const NOW = 1_000_000;

describe('getEntryValidity', () => {
  it('taze sinyal, fiyat girişte → fresh', () => {
    const r = getEntryValidity(base, 100, NOW + 30_000); // 30sn geçmiş
    expect(r.state).toBe('fresh');
    expect(r.reason).toBeNull();
  });

  it('1m sinyal, 2 mum (2dk) geçmişse → missed/time', () => {
    const r = getEntryValidity(base, 100, NOW + 121_000); // 2dk 1sn
    expect(r.state).toBe('missed');
    expect(r.reason).toBe('time');
  });

  it('5m sinyal, 6dk geçmiş (10dk dolmadı) → fresh', () => {
    const sig = { ...base, triggerTimeframe: '5m' };
    const r = getEntryValidity(sig, 100, NOW + 360_000); // 6dk
    expect(r.state).toBe('fresh');
  });

  it('5m sinyal, 11dk geçmiş → missed/time', () => {
    const sig = { ...base, triggerTimeframe: '5m' };
    const r = getEntryValidity(sig, 100, NOW + 660_001); // 11dk
    expect(r.state).toBe('missed');
    expect(r.reason).toBe('time');
  });

  it('long, uç fiyat riskin %60ı yukarı → missed/distance', () => {
    // risk=2, %60 = 1.2 → extremePrice = 101.2
    const r = getEntryValidity(base, 101.2, NOW + 30_000);
    expect(r.state).toBe('missed');
    expect(r.reason).toBe('distance');
  });

  it('long, uç fiyat riskin %40ı yukarı → fresh', () => {
    // risk=2, %40 = 0.8 → extremePrice = 100.8
    const r = getEntryValidity(base, 100.8, NOW + 30_000);
    expect(r.state).toBe('fresh');
  });

  it('short, uç fiyat riskin %60ı aşağı → missed/distance', () => {
    const sig = { ...base, direction: 'short', entryPrice: 100, stopPrice: 102 }; // risk=2
    // short ilerleme: entry - extremePrice = 1.2 → extremePrice=98.8
    const r = getEntryValidity(sig, 98.8, NOW + 30_000);
    expect(r.state).toBe('missed');
    expect(r.reason).toBe('distance');
  });

  it('fiyat uzaklaşıp geri döndü ama uç fiyat saklıysa → missed kalıcı', () => {
    // extremePrice (görülen max) hâlâ 101.2 — canlı fiyat 100 olsa da missed
    const r = getEntryValidity(base, 101.2, NOW + 30_000);
    expect(r.state).toBe('missed');
    expect(r.reason).toBe('distance');
  });

  it('triggerTimeframe undefined → 5m varsayılanı, hata yok', () => {
    const sig = { ...base, triggerTimeframe: undefined };
    const r = getEntryValidity(sig, 100, NOW + 30_000);
    expect(r.state).toBe('fresh'); // 30sn < 10dk
  });

  it('extremePrice null → sadece zamana bakar', () => {
    const r = getEntryValidity(base, null, NOW + 30_000);
    expect(r.state).toBe('fresh');
  });
});

describe('getEntryWindow', () => {
  it('1m sinyal, 30sn geçmiş → 90sn kaldı (2dk penceresi)', () => {
    const r = getEntryWindow(base, NOW + 30_000);
    expect(r.msLeft).toBe(90_000);
    expect(r.deadline).toBe(1_000_000 + 120_000);
  });

  it('5m sinyal, 6dk geçmiş (10dk penceresi) → 4dk kaldı', () => {
    const sig = { ...base, triggerTimeframe: '5m' };
    const r = getEntryWindow(sig, NOW + 360_000);
    expect(r.msLeft).toBe(240_000);
  });

  it('süre dolmuşsa msLeft negatif değil, 0', () => {
    const r = getEntryWindow(base, NOW + 999_000);
    expect(r.msLeft).toBe(0);
  });
});
