function pct(from, to) {
  const diff = ((to - from) / from) * 100;
  return (diff >= 0 ? '+' : '') + diff.toFixed(2) + '%';
}

export function formatEmailSubject({ symbol, direction }) {
  const emoji = direction === 'long' ? '🟢' : '🔴';
  return `${emoji} Scalp Sinyali: ${symbol} ${direction.toUpperCase()}`;
}

export function formatEmailHtml({ symbol, direction, entryPrice, stopPrice, targetPrice, confluenceScore, createdAt }) {
  const isLong = direction === 'long';
  const emoji = isLong ? '🟢' : '🔴';
  const dirLabel = direction.toUpperCase();
  const conf = Math.round((confluenceScore ?? 0) * 100);
  const color = isLong ? '#26a69a' : '#ef5350';
  const time = new Date(createdAt).toLocaleString('tr-TR');

  return `<html>
<body style="margin:0;padding:0;background:#0d1117;font-family:monospace;">
  <div style="max-width:480px;margin:32px auto;background:#161b22;border-radius:12px;overflow:hidden;border:1px solid #21262d;">
    <div style="background:${color};padding:16px 24px;">
      <h2 style="margin:0;color:#fff;font-size:20px;">${emoji} ${symbol} — ${dirLabel}</h2>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Güven: ${conf}% &nbsp;|&nbsp; ${time}</p>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;color:#c9d1d9;">
        <tr style="border-bottom:1px solid #21262d;">
          <td style="padding:10px 0;color:#8b949e;font-size:13px;">📍 Giriş</td>
          <td style="padding:10px 0;text-align:right;font-size:16px;font-weight:700;">${entryPrice}</td>
        </tr>
        <tr style="border-bottom:1px solid #21262d;">
          <td style="padding:10px 0;color:#8b949e;font-size:13px;">🛑 Stop</td>
          <td style="padding:10px 0;text-align:right;">
            <span style="font-size:16px;font-weight:700;">${stopPrice}</span>
            <span style="color:#ef5350;font-size:12px;margin-left:8px;">${pct(entryPrice, stopPrice)}</span>
          </td>
        </tr>
        <tr style="border-bottom:1px solid #21262d;">
          <td style="padding:10px 0;color:#8b949e;font-size:13px;">🎯 Hedef</td>
          <td style="padding:10px 0;text-align:right;">
            <span style="font-size:16px;font-weight:700;">${targetPrice}</span>
            <span style="color:#26a69a;font-size:12px;margin-left:8px;">${pct(entryPrice, targetPrice)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#8b949e;font-size:13px;">⚖️ R/R</td>
          <td style="padding:10px 0;text-align:right;font-size:16px;font-weight:700;">1.5</td>
        </tr>
      </table>
    </div>
    <div style="padding:12px 24px;border-top:1px solid #21262d;text-align:center;">
      <p style="margin:0;color:#8b949e;font-size:11px;">Scalp Asistanı — otomatik sinyal bildirimi</p>
    </div>
  </div>
</body>
</html>`;
}
