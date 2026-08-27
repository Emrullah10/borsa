import { describe, it, expect } from 'vitest';
import { commitCandle } from '../../src/domain/candle-buffer.js';

describe('commitCandle — zaman boşluğu (gap) koruması', () => {
  // 2026-08-26 olayı: Redis bağlantısı koptuğunda buffer bellekte donuyor,
  // saatler sonra reconnect olunca eski "forming" mum ile yeni gelen mum
  // arasında ~10 saatlik boşluk oluşuyordu. commitCandle bunu görmeden
  // eski mumu "kapandı" sayıp buffer'a ekliyordu → seri delikli hale
  // geliyor, göstergeler bozuluyordu.
  const maxSize = 60;

  it('normal ardışık mum: forming commit edilir', () => {
    const r = commitCandle({
      buffer: [], forming: { ts: 1000, close: 1 }, incoming: { ts: 61_000, close: 2 },
      maxSize, tfMs: 60_000,
    });
    expect(r.closedCandle).toEqual({ ts: 1000, close: 1 });
    expect(r.buffer).toHaveLength(1);
  });

  it('büyük boşluk: eski forming ATILIR, buffer sıfırlanır', () => {
    const tenHours = 10 * 3600_000;
    const r = commitCandle({
      buffer: [{ ts: 0, close: 0 }, { ts: 1000, close: 1 }],
      forming: { ts: 1000, close: 1 },
      incoming: { ts: 1000 + tenHours, close: 99 },
      maxSize, tfMs: 60_000,
    });
    expect(r.closedCandle).toBeNull();   // bayat mumla sinyal tetiklenmemeli
    expect(r.buffer).toHaveLength(0);    // delikli seri kullanılamaz
    expect(r.forming).toEqual({ ts: 1000 + tenHours, close: 99 });
  });

  it('küçük gecikme (2 mum) tolere edilir', () => {
    const r = commitCandle({
      buffer: [{ ts: 0 }], forming: { ts: 60_000 }, incoming: { ts: 180_000 },
      maxSize, tfMs: 60_000,
    });
    expect(r.closedCandle).not.toBeNull();
  });

  it('tfMs verilmezse eski davranış korunur (geriye uyumlu)', () => {
    const r = commitCandle({
      buffer: [], forming: { ts: 1000 }, incoming: { ts: 1000 + 10 * 3600_000 }, maxSize,
    });
    expect(r.closedCandle).not.toBeNull();
  });
});
