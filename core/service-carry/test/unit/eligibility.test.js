import { describe, it, expect } from 'vitest';
import { buildCarryUniverse } from '../../src/domain/eligibility.js';

const contracts = new Map([
  ['BTCUSDT', { isRwa: 'NO', symbolStatus: 'normal' }],
  ['TSLAUSDT', { isRwa: 'YES', symbolStatus: 'normal' }],
  ['NOSPOTUSDT', { isRwa: 'NO', symbolStatus: 'normal' }],
  ['THINUSDT', { isRwa: 'NO', symbolStatus: 'normal' }],
  ['HALTUSDT', { isRwa: 'NO', symbolStatus: 'restrictedAPI' }],
]);
const perp = new Map([['BTCUSDT', { usdtVolume: 2e9 }], ['TSLAUSDT', { usdtVolume: 1e8 }], ['NOSPOTUSDT', { usdtVolume: 5e7 }],
  ['THINUSDT', { usdtVolume: 5e7 }], ['HALTUSDT', { usdtVolume: 5e7 }]]);
const spot = new Map([['BTCUSDT', { usdtVolume: 1.8e8 }], ['TSLAUSDT', { usdtVolume: 1e7 }], ['THINUSDT', { usdtVolume: 2e5 }],
  ['HALTUSDT', { usdtVolume: 5e6 }]]);

describe('buildCarryUniverse', () => {
  const u = buildCarryUniverse({ contracts, perpTickers: perp, spotTickers: spot });

  it('likit kripto + spotu olan coin girer', () => {
    expect(u.get('BTCUSDT')).toEqual({ spotVolume: 1.8e8, perpVolume: 2e9 });
  });

  it('RWA (hisse/altın), spotu olmayan, spotu sığ ve normal olmayan kontratlar girmez', () => {
    expect([...u.keys()]).toEqual(['BTCUSDT']);
  });
});
