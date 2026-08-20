import { describe, it, expect } from 'vitest';
import { wilsonInterval } from './wilsonInterval.js';

describe('wilsonInterval', () => {
  it('n=0 için null döner', () => {
    expect(wilsonInterval(0, 0)).toBeNull();
  });

  it('n=100, wins=55 için dar bir aralık döner (yaklaşık %45-64)', () => {
    const r = wilsonInterval(55, 100);
    expect(r.low).toBeGreaterThan(40);
    expect(r.low).toBeLessThan(46);
    expect(r.high).toBeGreaterThan(63);
    expect(r.high).toBeLessThan(70);
  });

  it('n=30, wins=16 (%53.3) için geniş bir aralık döner (~%36-70)', () => {
    const r = wilsonInterval(16, 30);
    expect(r.low).toBeGreaterThan(30);
    expect(r.low).toBeLessThan(40);
    expect(r.high).toBeGreaterThan(65);
    expect(r.high).toBeLessThan(75);
  });

  it('sonuçlar 0-100 aralığında yüzde olarak döner', () => {
    const r = wilsonInterval(90, 100);
    expect(r.low).toBeGreaterThanOrEqual(0);
    expect(r.high).toBeLessThanOrEqual(100);
  });
});
