import { describe, it, expect } from 'vitest';
import { formatTelegramMessage } from '../../src/domain/telegram-formatter.js';

const signal = {
  symbol: 'TRUMPUSDT',
  direction: 'long',
  triggerTimeframe: '5m',
  entryPrice: 2.561,
  stopPrice: 2.486,
  targetPrice: 2.647,
  rrRatio: 1.149,
  confluenceScore: 0.83,
};

describe('formatTelegramMessage', () => {
  it('sembol, yön ve fiyatları içerir', () => {
    const msg = formatTelegramMessage(signal);
    expect(msg).toContain('TRUMPUSDT');
    expect(msg).toMatch(/LONG/i);
    expect(msg).toContain('2.561');
    expect(msg).toContain('2.486');
    expect(msg).toContain('2.647');
  });

  it('LONG ve SHORT farklı emoji kullanır', () => {
    const long = formatTelegramMessage(signal);
    const short = formatTelegramMessage({ ...signal, direction: 'short' });
    expect(long).not.toBe(short);
    expect(short).toMatch(/SHORT/i);
  });

  it('giriş penceresini belirtir — sinyal kısa süre geçerli', () => {
    expect(formatTelegramMessage(signal)).toMatch(/dakika|geçerli/i);
  });

  it('1m ve 5m için farklı geçerlilik süresi', () => {
    const m5 = formatTelegramMessage(signal);
    const m1 = formatTelegramMessage({ ...signal, triggerTimeframe: '1m' });
    expect(m5).not.toBe(m1);
  });

  it('eksik alanlarda çökmez', () => {
    expect(() => formatTelegramMessage({ symbol: 'X', direction: 'long' })).not.toThrow();
  });

  it('Telegram HTML parse_mode ile güvenli — özel karakter kaçırılır', () => {
    const msg = formatTelegramMessage({ ...signal, symbol: 'A<b>&X' });
    expect(msg).toContain('&lt;');
    expect(msg).toContain('&amp;');
  });
});
