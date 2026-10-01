import { describe, it, expect } from 'vitest';
import { makeHoldoutLock } from '../../../src/domain/lab/holdout-lock.js';

function memLock() {
  let store = null;
  return makeHoldoutLock({ read: () => store, write: (s) => { store = s; } });
}

// Holdout, aday başına TEK kez açılır: farklı ayarla ikinci açılış = sonuca bakıp ayar oynama.
describe('holdout-lock', () => {
  it('ilk açılışa izin verir ve kaydeder', () => {
    const lock = memLock();
    expect(lock.tryOpen('F1', { L: 14 })).toMatchObject({ allowed: true, dirty: false });
  });
  it('AYNI ayarla tekrar açılış serbest (deterministik, tekrar üretim)', () => {
    const lock = memLock(); lock.tryOpen('F1', { L: 14 });
    expect(lock.tryOpen('F1', { L: 14 })).toMatchObject({ allowed: true, dirty: false });
  });
  it('FARKLI ayarla ikinci açılış reddedilir', () => {
    const lock = memLock(); lock.tryOpen('F1', { L: 14 });
    const r = lock.tryOpen('F1', { L: 28 });
    expect(r.allowed).toBe(false); expect(r.reason).toMatch(/tek kez|farklı/i);
  });
  it('force ile açılır ama KİRLİ işaretlenir', () => {
    const lock = memLock(); lock.tryOpen('F1', { L: 14 });
    expect(lock.tryOpen('F1', { L: 28 }, { force: true })).toMatchObject({ allowed: true, dirty: true });
  });
  it('aileler birbirinden bağımsız', () => {
    const lock = memLock(); lock.tryOpen('F1', { L: 14 });
    expect(lock.tryOpen('F2', {})).toMatchObject({ allowed: true, dirty: false });
  });
  it('kayıtlı durum dışarı okunabilir (rapor için)', () => {
    const lock = memLock(); lock.tryOpen('F1', { L: 14 }, { now: '2026-10-01T00:00:00Z' });
    expect(lock.state().F1).toMatchObject({ config: { L: 14 }, openedAt: '2026-10-01T00:00:00Z' });
  });
});
