import { baseCoin } from './announcement-rules.js';

// Telegram mesajları (HTML parse_mode). Kullanıcı tercihi: soyut değil SOMUT — ne alınacak, ne
// satılacak, kaç adet, ne bekleniyor.
const usd = (v) => `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
const pct = (v, d = 1) => `%${(v * 100).toFixed(d)}`;
const qtyFmt = (q) => (q >= 100 ? q.toFixed(0) : q >= 1 ? q.toFixed(3) : q.toPrecision(4));

const REASON_TR = {
  'funding-düştü': 'funding yıllık %5\'in altına düştü',
  'sıralama-düştü': 'daha iyi fırsatlar var, sıralamada geriledi',
  'evren-dışı': 'likidite/evren şartını kaybetti',
  'risk-blok': 'borsa duyurusu (delist/swap vb.) nedeniyle risk',
};

export function formatOpenMessage(p, { paper = true } = {}) {
  const coin = baseCoin(p.symbol);
  return [
    `🟢 <b>${paper ? '[KÂĞIT] ' : ''}TAŞIMA AÇ — ${p.symbol}</b>`,
    `Spot: <b>${qtyFmt(p.qty)} ${coin} AL</b> @ ${p.entrySpot}`,
    `Futures: <b>${qtyFmt(p.qty)} ${coin} SHORT</b> @ ${p.entryPerp} (1x, aynı adet)`,
    `Tutar: ${usd(p.notionalUsd)} · son 14 gün funding: yıllık ${pct(p.entryApr)}`,
    `Fiyat yönü önemsiz: biri kazanırken diğeri kaybeder. Kazanç = funding ödemeleri.`,
  ].join('\n');
}

export function formatCloseMessage(p, pnl, { paper = true } = {}) {
  const coin = baseCoin(p.symbol);
  return [
    `🔴 <b>${paper ? '[KÂĞIT] ' : ''}TAŞIMA KAPAT — ${p.symbol}</b>`,
    `Spot: ${qtyFmt(p.qty)} ${coin} SAT · Futures: short'u KAPAT`,
    `Neden: ${REASON_TR[p.closeReason] ?? p.closeReason}`,
    `Sonuç: funding ${usd(pnl.fundingUsd)} · baz ${usd(pnl.basisUsd)} · komisyon -${usd(pnl.feesUsd)} → <b>net ${usd(pnl.netUsd)}</b>`,
  ].join('\n');
}

export function formatRiskMessage(assessment, ann) {
  const icon = { exit: '🚨', block: '⛔', watch: '👀' }[assessment.severity] ?? 'ℹ️';
  const action = {
    exit: 'Pozisyon KAPATILIYOR.',
    block: 'Bu coinde yeni pozisyon AÇILMAYACAK.',
    watch: 'Sadece bilgi.',
  }[assessment.severity] ?? '';
  return [
    `${icon} <b>RİSK: ${assessment.symbols.join(', ')}</b> — ${action}`,
    assessment.summary ? assessment.summary : ann.annTitle,
    `<a href="${ann.annUrl}">Duyuru</a>${assessment.model ? ` · AI: ${assessment.model}` : ' · (yalnız kural)'}`,
  ].join('\n');
}

// book: { equityUsd, startEquityUsd, positions: [{ symbol, pnl, daysOpen }], fundingTodayUsd }
export function formatDailyReport(book, { paper = true } = {}) {
  const lines = [
    `📊 <b>${paper ? '[KÂĞIT] ' : ''}Günlük taşıma raporu</b>`,
    `Özsermaye: ${usd(book.equityUsd)} (başlangıç ${usd(book.startEquityUsd)}, ${pct(book.equityUsd / book.startEquityUsd - 1, 2)})`,
    `Dün alınan funding: ${usd(book.fundingTodayUsd)}`,
  ];
  if (!book.positions.length) lines.push('Açık pozisyon yok — eşiği (yıllık %15) geçen likit coin yok, para bekliyor.');
  for (const p of book.positions) {
    lines.push(`• ${p.symbol}: ${p.daysOpen.toFixed(1)} gün · funding ${usd(p.pnl.fundingUsd)} · net ${usd(p.pnl.netUsd)}`);
  }
  return lines.join('\n');
}
