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

  // Faz 1.1 (B6 düzeltmesi): sweep.js aynı buffer'ı 27 kombinasyon × 5 sembol
  // arasında PAYLAŞIYORDU. Eski durumlu pointer implementasyonu monoton artıyordu,
  // hiç sıfırlanmıyordu — combo #1'in ilk sembolünden sonra pointer sona ulaşıyor,
  // kalan 26 combo'nun tamamı "gelecekteki" mumları görüyordu (higherTfTrend sert
  // kapı olduğu için etki büyüktü). Bu regresyon testi, aynı buffer'a AZALAN ts ile
  // sorgu yapıldığında (paylaşılan buffer senaryosunun basitleştirilmiş hali) hâlâ
  // doğru, o ts'e göre lookahead'siz sonuç dönmesini garanti eder — eski implementasyon
  // burada kırmızı verirdi (pointer geri sarılmadığı için gelecekteki mumları döndürürdü).
  describe('durumsuzluk (Faz 1.1, B6 lookahead sızıntısı regresyonu)', () => {
    it('azalan ts sırasıyla sorgulandığında hâlâ doğru, lookahead-siz pencere döner', () => {
      const candles = makeCandles([100, 200, 300, 400, 500]);
      const buf = makeAlignedBuffer(candles, 10);

      // Önce ileri git (paylaşılan buffer'da "başka bir combo/sembol"ün son sorgusu gibi)
      expect(buf.at(500).map(c => c.timestamp)).toEqual([100, 200, 300, 400, 500]);

      // Sonra GERİYE dön — yeni bir combo/sembol baştan başlıyor
      expect(buf.at(300).map(c => c.timestamp)).toEqual([100, 200, 300]);
      expect(buf.at(150).map(c => c.timestamp)).toEqual([100]);
      expect(buf.at(50)).toEqual([]);
    });

    it('aynı ts iki kez (farklı sıralarda) sorgulandığında BİREBİR aynı sonucu verir', () => {
      const candles = makeCandles([100, 200, 300, 400, 500]);
      const buf = makeAlignedBuffer(candles, 3);

      const first = buf.at(300).map(c => c.timestamp);
      buf.at(500); // araya başka bir sorgu gir
      const second = buf.at(300).map(c => c.timestamp);

      expect(second).toEqual(first);
      expect(second).toEqual([100, 200, 300]);
    });

    it('paylaşılan buffer simülasyonu: N ayrı "sembol" aynı buffer üzerinde baştan sorgu yapar, hepsi aynı sonucu almalı', () => {
      const candles = makeCandles([100, 200, 300, 400, 500, 600, 700, 800]);
      const buf = makeAlignedBuffer(candles, 4);

      // sweep.js'teki gerçek desen: aynı regimeBuffer/higherTfBuffer referansı
      // birden fazla sembol/combo döngüsünde en baştan (küçük ts) yeniden kullanılıyor.
      const results = [];
      for (let symbolIdx = 0; symbolIdx < 3; symbolIdx++) {
        const seq = [200, 400, 600, 800].map(ts => buf.at(ts).map(c => c.timestamp));
        results.push(seq);
      }
      // Her "sembol turu" birebir aynı sonucu vermeli — sızıntı yoksa turlar arası fark olmaz
      expect(results[1]).toEqual(results[0]);
      expect(results[2]).toEqual(results[0]);
      expect(results[0]).toEqual([
        [100, 200],
        [100, 200, 300, 400],
        [300, 400, 500, 600],
        [500, 600, 700, 800],
      ]);
    });
  });
});
