import { describe, it, expect } from 'vitest';
import { makeAlignedBuffer } from '../../src/domain/aligned-buffer.js';

const makeCandles = (timestamps) => timestamps.map(ts => ({ timestamp: ts, close: ts }));

describe('makeAlignedBuffer', () => {
  it('at(ts): sadece ts anında veya öncesinde kapanmış mumları döner (lookahead yok)', () => {
    const candles = makeCandles([100, 200, 300, 400, 500]);
    const buf = makeAlignedBuffer(candles, 10);
    const window = buf.at(300);
    expect(window.map(c => c.timestamp)).toEqual([100, 200, 300]);
  });

  it('at(ts): gelecekteki mumları asla içermez', () => {
    const candles = makeCandles([100, 200, 300, 400, 500]);
    const buf = makeAlignedBuffer(candles, 10);
    const window = buf.at(250);
    expect(window.map(c => c.timestamp)).toEqual([100, 200]);
  });

  it('windowSize kadar son mumu tutar (kayan pencere)', () => {
    const candles = makeCandles([100, 200, 300, 400, 500]);
    const buf = makeAlignedBuffer(candles, 2);
    const window = buf.at(500);
    expect(window.map(c => c.timestamp)).toEqual([400, 500]);
  });

  it('ardışık artan ts çağrıları ile rolling pointer doğru ilerler (O(n) garanti)', () => {
    const candles = makeCandles([100, 200, 300, 400, 500]);
    const buf = makeAlignedBuffer(candles, 10);
    expect(buf.at(150).map(c => c.timestamp)).toEqual([100]);
    expect(buf.at(350).map(c => c.timestamp)).toEqual([100, 200, 300]);
    expect(buf.at(600).map(c => c.timestamp)).toEqual([100, 200, 300, 400, 500]);
  });

  it('ts hiçbir mumdan büyük değilse boş dizi döner', () => {
    const candles = makeCandles([100, 200, 300]);
    const buf = makeAlignedBuffer(candles, 10);
    expect(buf.at(50)).toEqual([]);
  });

  it('boş candles dizisi ile at() her zaman boş döner', () => {
    const buf = makeAlignedBuffer([], 10);
    expect(buf.at(1000)).toEqual([]);
  });
});
