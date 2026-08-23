// Telegram sinyal mesajı — saf fonksiyon, I/O yok.
//
// NEDEN TELEGRAM: 5m sinyal ~10dk geçerli (entryValidity WINDOW_CANDLES=2).
// Çalışan bildirim kanalı olmadan insan sinyali zamanında göremiyor, geç
// giriyor ve kayma büyüyor — ölçülen edge'in ~%80'i tam olarak burada
// kayboluyor (avg_sim_r +0.037R vs avg_r_after_fee +0.183R).
// E-posta kutu doldurduğu için kapatılmıştı; Telegram anlık ve sessiz.

// Sinyal geçerlilik penceresi — panel ile aynı mantık (entryValidity.js)
const WINDOW_MINUTES = { '1m': 2, '5m': 10, '15m': 30 };

// Telegram parse_mode:'HTML' beklediği için özel karakterler kaçırılmalı
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmt(n) {
  return n == null || !Number.isFinite(Number(n)) ? '—' : String(n);
}

export function formatTelegramMessage(signal) {
  const {
    symbol, direction, triggerTimeframe, entryPrice, stopPrice,
    targetPrice, rrRatio, confluenceScore,
  } = signal ?? {};

  const isLong = direction === 'long';
  const arrow = isLong ? '🟢' : '🔴';
  const label = isLong ? 'LONG' : 'SHORT';
  const minutes = WINDOW_MINUTES[triggerTimeframe] ?? 10;
  const conf = confluenceScore != null ? `%${(confluenceScore * 100).toFixed(0)}` : '—';

  return [
    `${arrow} <b>${esc(symbol)}</b> — <b>${label}</b> (${esc(triggerTimeframe ?? '?')})`,
    ``,
    `Giriş:  <code>${fmt(entryPrice)}</code>`,
    `Stop:   <code>${fmt(stopPrice)}</code>`,
    `Hedef:  <code>${fmt(targetPrice)}</code>`,
    `R/R: ${fmt(rrRatio)} · Güven: ${conf}`,
    ``,
    `⏱ Yaklaşık <b>${minutes} dakika</b> geçerli — bu süreden sonra fiyat kaçmış olur.`,
  ].join('\n');
}
