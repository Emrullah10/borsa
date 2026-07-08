import { describe, it, expect } from 'vitest';
import { theme, COLORS } from './theme.js';

describe('theme', () => {
  it('koyu mod ve doğru arka plan', () => {
    expect(theme.palette.mode).toBe('dark');
    expect(theme.palette.background.default).toBe('#0d1117');
  });
  it('LONG yeşil, SHORT kırmızı renk sabitleri', () => {
    expect(COLORS.long).toBe('#26a69a');
    expect(COLORS.short).toBe('#ef5350');
  });
});
