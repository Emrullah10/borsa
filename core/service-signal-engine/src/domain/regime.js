// BTC trendine göre piyasa rejimini hesaplar
// 'bull' | 'bear' | 'neutral'
// 15m (kısa) + 4h (uzun) trendi birleştirir: ikisi aynıysa o yön, farklıysa neutral

function emaCalc(arr, period) {
  if (arr.length < period) return null;
  const k = 2 / (period + 1);
  let ema = arr.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < arr.length; i++) ema = arr[i] * k + ema * (1 - k);
  return ema;
}

// Tek timeframe için trend yönü: 'bull' | 'bear' | 'neutral'
export function calcTfTrend(candles) {
  if (!candles || candles.length < 30) return 'neutral';

  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];

  const ema50 = emaCalc(closes, 50);
  const ema21 = emaCalc(closes, 21);
  if (ema50 === null || ema21 === null) return 'neutral';

  // EMA50 eğimi: son 5 mumdaki değişim
  const closes50ago = closes.slice(-Math.min(closes.length, 55));
  const ema50prev = emaCalc(closes50ago.slice(0, -5), 50);
  const ema50rising = ema50prev !== null ? ema50 > ema50prev : null;

  if (currentPrice > ema50 && ema21 > ema50 && ema50rising !== false) return 'bull';
  if (currentPrice < ema50 && ema21 < ema50 && ema50rising !== true) return 'bear';
  return 'neutral';
}

// Rejim: sadece BTC 4h trendine bakar (ana piyasa yönü)
export function calcRegime(btc4hCandles) {
  return calcTfTrend(btc4hCandles);
}

// 1m sinyalleri için 5m trend teyidi: basit EMA9 vs EMA21 karşılaştırması.
// calcTfTrend'den farklı bir kural seti — 'long' | 'short' | 'neutral' | null (<30 mum)
export function calcHigherTfTrend(closes) {
  if (!closes || closes.length < 30) return null;
  const emaVal = (arr, period) => {
    if (arr.length < period) return null;
    const k = 2 / (period + 1);
    let ema = arr.slice(0, period).reduce((s, v) => s + v, 0) / period;
    for (let i = period; i < arr.length; i++) ema = arr[i] * k + ema * (1 - k);
    return ema;
  };
  const e9 = emaVal(closes, 9);
  const e21 = emaVal(closes, 21);
  if (e9 === null || e21 === null) return null;
  return e9 > e21 ? 'long' : e9 < e21 ? 'short' : 'neutral';
}
