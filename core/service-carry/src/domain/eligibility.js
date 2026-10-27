import { CARRY_RULES } from './carry-config.js';

// Taşıma evreni: yalnız kripto (RWA değil) + Bitget'te aynı adla USDT spot çifti olan +
// iki bacak da yeterince likit perp'ler. Spotu olmayan coin'de strateji uygulanamaz (ölçüldü:
// funding verisi olan 161 coin'in 44'ünün Bitget spotu yok — hisse/altın perp'leri dahil).
//
// contracts:   Map<symbol, { isRwa, symbolStatus }>  (Bitget /mix/market/contracts)
// perpTickers: Map<symbol, { usdtVolume }>
// spotTickers: Map<symbol, { usdtVolume }>          (yalnız online USDT spot çiftleri)
// Dönüş: Map<symbol, { spotVolume, perpVolume }>
export function buildCarryUniverse({ contracts, perpTickers, spotTickers, rules = CARRY_RULES }) {
  const out = new Map();
  for (const [symbol, c] of contracts) {
    if (c.isRwa === 'YES' || c.symbolStatus !== 'normal') continue;
    const perp = perpTickers.get(symbol);
    const spot = spotTickers.get(symbol);
    if (!perp || !spot) continue;
    if (spot.usdtVolume < rules.minSpotVolumeUsdt || perp.usdtVolume < rules.minPerpVolumeUsdt) continue;
    out.set(symbol, { spotVolume: spot.usdtVolume, perpVolume: perp.usdtVolume });
  }
  return out;
}
