import { describe, it, expect } from 'vitest';
import { formatEmailSubject, formatEmailHtml } from '../../src/domain/formatter.js';

const longSignal = {
  symbol: 'BTCUSDT',
  direction: 'long',
  entryPrice: 64000,
  stopPrice: 63700,
  targetPrice: 64500,
  confluenceScore: 0.88,
  createdAt: '2026-06-04T07:00:00.000Z',
};
const shortSignal = { ...longSignal, direction: 'short', stopPrice: 64300, targetPrice: 63500 };

describe('formatEmailSubject', () => {
  it('long sinyal için konu satırı üretir', () => {
    const s = formatEmailSubject(longSignal);
    expect(s).toContain('BTCUSDT');
    expect(s).toContain('LONG');
    expect(s).toContain('🟢');
  });
  it('short sinyal için konu satırı üretir', () => {
    const s = formatEmailSubject(shortSignal);
    expect(s).toContain('SHORT');
    expect(s).toContain('🔴');
  });
});

describe('formatEmailHtml', () => {
  it('giriş, stop, hedef fiyatları içerir', () => {
    const html = formatEmailHtml(longSignal);
    expect(html).toContain('64000');
    expect(html).toContain('63700');
    expect(html).toContain('64500');
  });
  it('confluence skorunu yüzde gösterir', () => {
    const html = formatEmailHtml(longSignal);
    expect(html).toContain('88%');
  });
  it('stop için negatif, hedef için pozitif yüzde fark içerir', () => {
    const html = formatEmailHtml(longSignal);
    expect(html).toMatch(/-0\.\d+%/);
    expect(html).toMatch(/\+0\.\d+%/);
  });
  it('HTML yapısı geçerli', () => {
    const html = formatEmailHtml(longSignal);
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });
});
