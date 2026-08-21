import { describe, it, expect } from 'vitest';
import { commitCandle } from '../../src/domain/candle-buffer.js';

function candle(ts, close) {
  return { ts, open: close, high: close, low: close, close, volume: 100 };
}

describe('commitCandle', () => {
  it('ilk mesaj: buffer değişmez, forming set edilir, closedCandle null', () => {
    const r = commitCandle({ buffer: [], forming: null, incoming: candle(1000, 10), maxSize: 60 });
    expect(r.buffer).toEqual([]);
    expect(r.forming).toEqual(candle(1000, 10));
    expect(r.closedCandle).toBeNull();
  });

  it('aynı ts ile ardışık çağrılar: buffer boy değiştirmez, closedCandle hep null, forming güncellenir', () => {
    let state = { buffer: [], forming: candle(1000, 10), closedCandle: null };
    for (const close of [11, 12, 13, 9]) {
      state = commitCandle({ buffer: state.buffer, forming: state.forming, incoming: candle(1000, close), maxSize: 60 });
      expect(state.buffer).toEqual([]);
      expect(state.closedCandle).toBeNull();
    }
    expect(state.forming).toEqual(candle(1000, 9)); // son değeri yansıtır
  });

  it('ts değişince: önceki forming buffer\'a eklenir ve closedCandle olarak döner, yeni forming set edilir', () => {
    const forming = candle(1000, 13); // önceki mumun son (en güncel) hali
    const r = commitCandle({ buffer: [], forming, incoming: candle(1060, 20), maxSize: 60 });
    expect(r.buffer).toEqual([forming]);
    expect(r.closedCandle).toEqual(forming);
    expect(r.forming).toEqual(candle(1060, 20));
  });

  it('maxSize aşımı: buffer başından kırpılır', () => {
    const buffer = [candle(0, 1), candle(60, 2)];
    const r = commitCandle({ buffer, forming: candle(120, 3), incoming: candle(180, 4), maxSize: 2 });
    expect(r.buffer).toEqual([candle(60, 2), candle(120, 3)]);
    expect(r.buffer.length).toBe(2);
  });

  it('5 ardışık aynı-ts mesajdan sonra ts değişince sadece 1 mum commit edilir', () => {
    let state = { buffer: [], forming: null, closedCandle: null };
    for (const close of [10, 10.5, 11, 11.2, 10.8]) {
      state = commitCandle({ buffer: state.buffer, forming: state.forming, incoming: candle(1000, close), maxSize: 60 });
    }
    expect(state.buffer).toEqual([]); // hâlâ forming, hiç commit olmadı

    state = commitCandle({ buffer: state.buffer, forming: state.forming, incoming: candle(1060, 15), maxSize: 60 });
    expect(state.buffer.length).toBe(1);
    expect(state.buffer[0].close).toBe(10.8); // son forming değeri commit edildi
    expect(state.closedCandle.close).toBe(10.8);
  });
});
