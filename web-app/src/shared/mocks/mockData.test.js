import { describe, it, expect } from 'vitest';
import { mockSignals, mockCandles, mockServiceStatus } from './mockData.js';

describe('mockData', () => {
  it('en az 50 sinyal döner ve gerekli alanları içerir', () => {
    expect(mockSignals.length).toBeGreaterThanOrEqual(50);
    const s = mockSignals[0];
    for (const key of ['id', 'symbol', 'direction', 'entryPrice', 'stopPrice', 'targetPrice', 'rrRatio', 'confluenceScore', 'createdAt', 'status']) {
      expect(s).toHaveProperty(key);
    }
  });
  it('direction sadece long veya short', () => {
    for (const s of mockSignals) {
      expect(['long', 'short']).toContain(s.direction);
    }
  });
  it('mumlar timestamp/open/high/low/close/volume içerir', () => {
    const c = mockCandles[0];
    expect(c).toHaveProperty('timestamp');
    expect(c).toHaveProperty('open');
    expect(c).toHaveProperty('close');
    expect(mockCandles.length).toBeGreaterThan(60);
  });
  it('servis durumu market-data ve signal-engine içerir', () => {
    expect(mockServiceStatus).toHaveProperty('marketData');
    expect(mockServiceStatus).toHaveProperty('signalEngine');
  });
});
