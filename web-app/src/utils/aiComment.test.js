import { describe, it, expect } from 'vitest';
import { generateAiComment } from './aiComment.js';

describe('generateAiComment', () => {
  it('long + düşük RSI → aşırı satım mesajı içerir', () => {
    const comment = generateAiComment({
      direction: 'long',
      confluenceScore: 0.87,
      indicatorsSnapshot: { rsi: 28, macdHistogram: 0.1, ema9: 100, ema21: 98 },
    });
    expect(comment).toContain('RSI');
    expect(comment).toContain('28');
  });

  it('short + yüksek RSI → aşırı alım mesajı içerir', () => {
    const comment = generateAiComment({
      direction: 'short',
      confluenceScore: 0.72,
      indicatorsSnapshot: { rsi: 74, macdHistogram: -0.2, ema9: 95, ema21: 100 },
    });
    expect(comment).toContain('RSI');
    expect(comment).toContain('74');
  });

  it('eksik snapshot → fallback mesajı döner, throw etmez', () => {
    const comment = generateAiComment({
      direction: 'long',
      confluenceScore: 0.68,
      indicatorsSnapshot: null,
    });
    expect(typeof comment).toBe('string');
    expect(comment.length).toBeGreaterThan(0);
  });
});
