import { describe, it, expect } from 'vitest';
import { matchAnnouncement, maxSeverity } from '../../src/domain/announcement-rules.js';

const watched = new Set(['NEXUSDT', 'ETHUSDT', 'SOLUSDT', 'USUSDT', 'WLDUSDT']);
const m = (annTitle) => matchAnnouncement({ annTitle }, watched);

describe('matchAnnouncement', () => {
  it('gerçek Bitget delist başlığı → exit', () => {
    expect(m('[Important] Bitget to delist NEXUSDT futures and related services'))
      .toEqual({ symbols: ['NEXUSDT'], severity: 'exit' });
  });

  it('spot çifti delist (BASE/USDT) → exit', () => {
    expect(m('Bitget will delist SOL/USDT spot trading pair').severity).toBe('exit');
  });

  it('token swap / rebrand → block', () => {
    expect(m('Bitget will support the WLD token swap and rebranding').severity).toBe('block');
  });

  it('funding aralığı değişikliği → watch', () => {
    expect(m('Bitget to adjust the funding rate settlement frequency for ETHUSDT').severity).toBe('watch');
  });

  it('benzer adlı başka coin eşleşmez (ETHFI ≠ ETH)', () => {
    expect(m('Bitget to delist ETHFIUSDT futures').symbols).toEqual([]);
  });

  it('2 harfli coin yalnız USDT ekiyle eşleşir ("US stocks" ≠ USUSDT)', () => {
    expect(m('Bitget to delist US stock futures').symbols).toEqual([]);
    expect(m('Bitget to delist USUSDT futures').symbols).toEqual(['USUSDT']);
  });

  it('izlenen coin geçmiyorsa none', () => {
    expect(m('Bitget Streamer Incentive Program').severity).toBe('none');
  });
});

describe('maxSeverity', () => {
  it('sıra: none < watch < block < exit', () => {
    expect(maxSeverity('watch', 'exit')).toBe('exit');
    expect(maxSeverity('exit', 'none')).toBe('exit');
    expect(maxSeverity('block', 'watch')).toBe('block');
  });
});
