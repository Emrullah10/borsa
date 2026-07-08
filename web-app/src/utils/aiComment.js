export function generateAiComment(signal) {
  const { direction, confluenceScore, indicatorsSnapshot: snap } = signal;
  if (!snap) {
    return `Çoklu indikatör ${direction === 'long' ? 'long' : 'short'} sinyali verdi. Confluence: ${confluenceScore}.`;
  }
  const { rsi, ema9, ema21 } = snap;
  const score = confluenceScore?.toFixed ? confluenceScore.toFixed(2) : confluenceScore;

  if (direction === 'long') {
    if (rsi != null && rsi < 35) {
      return `RSI ${rsi.toFixed(0)}'den döndü — aşırı satım bölgesinden çıkış. EMA konfigürasyonu long destekliyor. Confluence: ${score}.`;
    }
    if (ema9 != null && ema21 != null && ema9 > ema21) {
      return `EMA9 EMA21 üzerinde, momentum pozitif. RSI ${rsi?.toFixed(0) ?? '—'} nötr bölgede. Confluence: ${score}.`;
    }
    return `Çoklu indikatör long sinyali verdi. Confluence skoru: ${score}.`;
  } else {
    if (rsi != null && rsi > 70) {
      return `RSI ${rsi.toFixed(0)} — aşırı alım bölgesinde. Kısa vadeli düzeltme bekleniyor. Confluence: ${score}.`;
    }
    if (ema9 != null && ema21 != null && ema9 < ema21) {
      return `EMA9 EMA21 altında, momentum negatife döndü. Confluence: ${score}.`;
    }
    return `Çoklu indikatör short sinyali verdi. Confluence skoru: ${score}.`;
  }
}
