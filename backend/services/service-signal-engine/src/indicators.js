import TI from 'technicalindicators';

const last = (arr) => arr?.length ? arr[arr.length - 1] : null;

export function calcEMA(closes, period) {
  if (closes.length < period) return [];
  return TI.EMA.calculate({ period, values: closes });
}

export function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return [];
  return TI.RSI.calculate({ period, values: closes });
}

export function calcBollingerBands(closes, period = 20, stdDev = 2) {
  if (closes.length < period) return null;
  const result = TI.BollingerBands.calculate({ period, stdDev, values: closes });
  return last(result) ?? null;
}

export function calcATR(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return 0;
  const result = TI.ATR.calculate({ period, high: highs, low: lows, close: closes });
  return last(result) ?? 0;
}

export function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  if (closes.length < slow) return null;
  const result = TI.MACD.calculate({
    values: closes,
    fastPeriod: fast,
    slowPeriod: slow,
    signalPeriod: signal,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  if (!result?.length) return null;
  // Find the last fully-defined record (MACD + signal + histogram all defined)
  for (let i = result.length - 1; i >= 0; i--) {
    const r = result[i];
    if (r && r.MACD !== undefined && r.signal !== undefined && r.histogram !== undefined) {
      return { macd: r.MACD, signal: r.signal, histogram: r.histogram };
    }
  }
  // Fallback: return last record with MACD only, using 0 for missing fields
  const r = result[result.length - 1];
  if (!r || r.MACD === undefined) return null;
  return { macd: r.MACD, signal: r.signal ?? 0, histogram: r.histogram ?? 0 };
}

export function calcVWAP(highs, lows, closes, volumes) {
  const len = Math.min(highs.length, lows.length, closes.length, volumes.length);
  let cumTP = 0, cumVol = 0;
  for (let i = 0; i < len; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumTP  += tp * volumes[i];
    cumVol += volumes[i];
  }
  return cumVol > 0 ? cumTP / cumVol : closes[len - 1] ?? 0;
}

export function calcADX(highs, lows, closes, period = 14) {
  if (closes.length < period * 2) return null;
  const result = TI.ADX.calculate({ period, high: highs, low: lows, close: closes });
  const val = last(result);
  return val ? val.adx : null;
}

// Pivot-tabanlı dinamik destek/direnç seviyeleri
// lookback: her iki yanda kaç mum kontrol edilsin
// tolerance: aynı zone sayılması için fiyat yakınlığı (0.003 = %0.3)
export function calcSupportResistance(candles, lookback = 5, tolerance = 0.003) {
  const highs = candles.map(c => c.high);
  const lows  = candles.map(c => c.low);
  const len   = candles.length;

  const pivotHighs = [];
  const pivotLows  = [];

  for (let i = lookback; i < len - lookback; i++) {
    const isHigh = highs.slice(i - lookback, i).every(h => h <= highs[i]) &&
                   highs.slice(i + 1, i + lookback + 1).every(h => h <= highs[i]);
    if (isHigh) pivotHighs.push(highs[i]);

    const isLow  = lows.slice(i - lookback, i).every(l => l >= lows[i]) &&
                   lows.slice(i + 1, i + lookback + 1).every(l => l >= lows[i]);
    if (isLow) pivotLows.push(lows[i]);
  }

  // Yakın pivotları tek seviyeye indir (en son değeri al)
  const cluster = (pivots) => {
    if (!pivots.length) return null;
    const sorted = [...pivots].sort((a, b) => a - b);
    const zones = [];
    let group = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i] - group[0]) / group[0] <= tolerance) {
        group.push(sorted[i]);
      } else {
        zones.push(group.reduce((s, v) => s + v, 0) / group.length);
        group = [sorted[i]];
      }
    }
    zones.push(group.reduce((s, v) => s + v, 0) / group.length);
    return zones;
  };

  return {
    supportLevels:    cluster(pivotLows)  ?? [],
    resistanceLevels: cluster(pivotHighs) ?? [],
  };
}

export function calcVolumeSMA(volumes, period = 20) {
  if (volumes.length < period) return null;
  const slice = volumes.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

export function calcAllIndicators(candles) {
  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  const { supportLevels, resistanceLevels } = calcSupportResistance(candles);
  const volumeSMA = calcVolumeSMA(volumes);
  const currentVolume = volumes[volumes.length - 1] ?? 0;
  const volumeRatio = volumeSMA > 0 ? currentVolume / volumeSMA : 1;

  // En yakın destek ve direnç seviyelerini bul
  const currentClose = closes[closes.length - 1] ?? 0;
  const nearestSupport = supportLevels.length
    ? supportLevels.filter(l => l <= currentClose).sort((a, b) => b - a)[0] ?? null
    : null;
  const nearestResistance = resistanceLevels.length
    ? resistanceLevels.filter(l => l >= currentClose).sort((a, b) => a - b)[0] ?? null
    : null;

  return {
    ema9:  last(calcEMA(closes, 9))  ?? null,
    ema21: last(calcEMA(closes, 21)) ?? null,
    ema50: last(calcEMA(closes, 50)) ?? null,
    rsi:   last(calcRSI(closes, 14)) ?? null,
    macd:  calcMACD(closes),
    bb:    calcBollingerBands(closes, 20, 2),
    atr:   calcATR(highs, lows, closes, 14),
    vwap:  calcVWAP(highs, lows, closes, volumes),
    adx:           calcADX(highs, lows, closes, 14),
    supportLevel:  nearestSupport,
    resistanceLevel: nearestResistance,
    volumeRatio,
  };
}
