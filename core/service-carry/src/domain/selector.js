import { CARRY_RULES } from './carry-config.js';

// Günlük karar: hangi pozisyonlar kapanır, hangi coinler açılır. Saf — backtest ve canlı aynı
// fonksiyonu çağırır (parite kod düzeyinde).
//
// candidates: [{ symbol, apr }] — yalnız ELIGIBLE evren (RWA değil, spotu var, hacim eşikleri,
//             delist bloğu yok), apr = trailingApr (null olanlar dahil edilmemeli)
// held:       Iterable<symbol> — şu an açık pozisyonlar
// blocked:    Set<symbol> — risk bekçisinin zorla kapattırdığı coinler (delist vb.)
//
// Dönüş: { close: [{ symbol, reason }], open: [{ symbol, apr }], keep: [symbol] }
export function selectCarryBook({ candidates, held, blocked = new Set(), rules = CARRY_RULES }) {
  const N = rules.slots;
  const ranked = [...candidates].sort((a, b) => b.apr - a.apr || a.symbol.localeCompare(b.symbol));
  const rankOf = new Map(ranked.map((c, i) => [c.symbol, i]));
  const aprOf = new Map(ranked.map((c) => [c.symbol, c.apr]));

  const close = [];
  const keep = [];
  for (const symbol of held) {
    const apr = aprOf.get(symbol);
    const rank = rankOf.get(symbol);
    let reason = null;
    if (blocked.has(symbol)) reason = 'risk-blok';
    else if (apr === undefined) reason = 'evren-dışı';
    else if (apr < rules.exitApr) reason = 'funding-düştü';
    else if (rank >= rules.rankBufferMult * N) reason = 'sıralama-düştü';
    if (reason) close.push({ symbol, reason }); else keep.push(symbol);
  }

  const open = [];
  const taken = new Set(keep);
  for (const c of ranked) {
    if (taken.size >= N) break;
    if (c.apr < rules.entryApr) break;
    if (taken.has(c.symbol) || blocked.has(c.symbol)) continue;
    taken.add(c.symbol);
    open.push({ symbol: c.symbol, apr: c.apr });
  }

  return { close, open, keep };
}
