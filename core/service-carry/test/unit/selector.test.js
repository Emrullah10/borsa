import { describe, it, expect } from 'vitest';
import { selectCarryBook } from '../../src/domain/selector.js';
import { CARRY_RULES } from '../../src/domain/carry-config.js';

const rules = { ...CARRY_RULES, slots: 2, entryApr: 0.15, exitApr: 0.05, rankBufferMult: 2 };
const c = (symbol, apr) => ({ symbol, apr });

describe('selectCarryBook', () => {
  it('boş defterde eşiği geçen en yüksek N coini açar', () => {
    const r = selectCarryBook({ candidates: [c('A', 0.3), c('B', 0.5), c('C', 0.2), c('D', 0.1)], held: [], rules });
    expect(r.open.map((o) => o.symbol)).toEqual(['B', 'A']);
    expect(r.close).toEqual([]);
  });

  it('giriş eşiğinin altındaki coin açılmaz (slot boş kalır)', () => {
    const r = selectCarryBook({ candidates: [c('A', 0.14), c('B', 0.10)], held: [], rules });
    expect(r.open).toEqual([]);
  });

  it('çıkış eşiğinin altına düşen tutulan coin kapanır', () => {
    const r = selectCarryBook({ candidates: [c('A', 0.04), c('B', 0.3)], held: ['A'], rules });
    expect(r.close).toEqual([{ symbol: 'A', reason: 'funding-düştü' }]);
    expect(r.open.map((o) => o.symbol)).toEqual(['B']);
  });

  it('histerezis: giriş ile çıkış arasındaki tutulan coin KORUNUR (gereksiz işlem yok)', () => {
    const r = selectCarryBook({ candidates: [c('A', 0.08), c('B', 0.3)], held: ['A'], rules });
    expect(r.keep).toEqual(['A']);
    expect(r.close).toEqual([]);
  });

  it('sıralamada 2N dışına düşen kapanır', () => {
    const cands = [c('B', 0.9), c('C', 0.8), c('D', 0.7), c('E', 0.6), c('A', 0.2)];
    const r = selectCarryBook({ candidates: cands, held: ['A'], rules });
    expect(r.close).toEqual([{ symbol: 'A', reason: 'sıralama-düştü' }]);
  });

  it('evrenden çıkan coin kapanır', () => {
    const r = selectCarryBook({ candidates: [c('B', 0.3)], held: ['A'], rules });
    expect(r.close).toEqual([{ symbol: 'A', reason: 'evren-dışı' }]);
  });

  it('risk bloğu: tutulan kapanır ve funding yüksek olsa da yeniden açılmaz', () => {
    const r = selectCarryBook({ candidates: [c('A', 0.9), c('B', 0.3)], held: ['A'], blocked: new Set(['A']), rules });
    expect(r.close).toEqual([{ symbol: 'A', reason: 'risk-blok' }]);
    expect(r.open.map((o) => o.symbol)).toEqual(['B']);
  });

  it('eşit APR\'de sembol adına göre deterministik', () => {
    const r = selectCarryBook({ candidates: [c('Z', 0.3), c('A', 0.3), c('M', 0.3)], held: [], rules });
    expect(r.open.map((o) => o.symbol)).toEqual(['A', 'M']);
  });
});
