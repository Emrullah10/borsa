import { describe, it, expect } from 'vitest';
import { directionalWinRate } from './directionalWinRate.js';

describe('directionalWinRate', () => {
  // API tüm sayıları STRING döndürüyor (Postgres COUNT/SUM text olarak dönüyor).
  // "52" + "37" JS'de string birleştirme yapar ("5237"), toplama değil —
  // bu yüzden 52/(52+37) yerine 52/5237 = %1.0 gibi saçma bir sonuç çıkıyordu.
  it('string sayılarla doğru yüzde hesaplar (asıl bug buydu)', () => {
    expect(directionalWinRate('52', '37')).toBe('58.4');
  });

  it('number sayılarla da çalışır', () => {
    expect(directionalWinRate(52, 37)).toBe('58.4');
  });

  it('ikisi de sıfırsa null döner', () => {
    expect(directionalWinRate(0, 0)).toBeNull();
    expect(directionalWinRate('0', '0')).toBeNull();
  });

  it('null/undefined güvenli', () => {
    expect(directionalWinRate(null, null)).toBeNull();
    expect(directionalWinRate(undefined, 5)).toBe('0.0');
  });

  it('sadece kazananlar varsa %100', () => {
    expect(directionalWinRate('10', '0')).toBe('100.0');
  });
});
