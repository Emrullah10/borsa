// Bitget duyurularından taşıma pozisyonlarına risk çıkarımı — KURAL katmanı.
// AI katmanı (ai-sentinel) bunun ÜSTÜNE çalışır ve yalnız ciddiyeti YÜKSELTEBİLİR; kural "exit"
// dediyse model ne derse desin pozisyon kapanır. Delist duyurusunu kaçırmak bu stratejinin en
// büyük operasyonel riski: perp zorla kapanır, spot bacak tek başına kalır.

export const SEVERITY_ORDER = ['none', 'watch', 'block', 'exit'];
export const maxSeverity = (a, b) =>
  (SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b);

const RULES = [
  { severity: 'exit', re: /\bdelist|\bremov(e|al)\b.*\b(pair|futures|trading)|\bcease\b|\bterminat/i },
  { severity: 'block', re: /token swap|rebrand|migrat|redenominat|contract swap|suspend|halt|pause/i },
  { severity: 'watch', re: /funding rate|settlement (frequency|interval)|maintenance margin|leverage|risk limit|position limit/i },
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// `BTCUSDT` → `BTC`; başlıkta coin adı tek kelime olarak, `BTCUSDT` ya da `BTC/USDT` olarak geçebilir.
export function baseCoin(symbol) {
  return symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol;
}

// 1-2 harfli coinler (S, W, US...) başlıkta sıradan kelimeyle çakışır → yalnız USDT ekiyle eşleşir.
function mentions(title, symbol) {
  const raw = baseCoin(symbol);
  const base = escapeRe(raw);
  const suffix = raw.length < 3 ? '(USDT|/USDT)' : '(USDT|/USDT)?';
  return new RegExp(`(^|[^A-Z0-9])${base}${suffix}([^A-Z0-9]|$)`).test(title);
}

// ann: { annTitle }, watched: Iterable<symbol> (açık pozisyonlar + aday listesi)
// Dönüş: { symbols: [...], severity: 'none'|'watch'|'block'|'exit' }
export function matchAnnouncement(ann, watched) {
  const title = ann.annTitle ?? '';
  const symbols = [...watched].filter((s) => mentions(title, s));
  if (!symbols.length) return { symbols, severity: 'none' };
  const hit = RULES.find((r) => r.re.test(title));
  return { symbols, severity: hit ? hit.severity : 'watch' };
}
