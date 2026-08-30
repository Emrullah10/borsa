import { evaluateOutcome, evaluateSimOutcome } from '@borsa-bot/core-tracker/src/domain/evaluate-outcome.js';

const MAX_CANDLES = 240;
const CANDLE_MS = 60 * 1000;
// 240 × 1m = 4h, core/service-tracker'ın varsayılan timeoutMs'iyle aynı (evaluate-outcome.js).
const TIMEOUT_MS = MAX_CANDLES * CANDLE_MS;

// Parite düzeltmesi (2026-08-20): önceden bu fonksiyon kendi TP/SL/timeout mantığını
// taşıyordu — fee/slippage yoktu, giriş fiyatı setup.entryPrice'tı (mum kapanışı),
// TP/SL beraberliğinde TP kazanıyordu, timeout'ta r=0 varsayılıyordu. Canlı
// core/service-tracker/src/domain/evaluate-outcome.js ise girişi sonraki mumun
// açılışı±slippage alıyor, SL-first tie-break yapıyor, fee'yi R'ye çeviriyordu.
// Artık aynı saf fonksiyonlar çağrılıyor — parite kod düzeyinde garanti.
//
// Faz 1.2 (B10 düzeltmesi, 2026-08-30): "bedava timeout" giderildi. Önceden
// `age > timeoutMs` KESİN eşitsizliği + `now = (i+1)*CANDLE_MS` (max = TIMEOUT_MS
// TAM) kombinasyonu backtest'te timeout'un evaluateOutcome içinden asla
// tetiklenmemesine yol açıyordu — döngü sonuna düşüp aşağıdaki fallback'teki
// r:0 kullanılıyordu (fee'siz, mark-to-market'siz). evaluate-outcome.js artık
// `>=` kullanıyor, bu yüzden son mumda (i = window.length-1) `now` = TIMEOUT_MS
// olduğunda evaluateOutcome kendi timeout dalına girip GERÇEK mark-to-market R +
// fee hesaplıyor — canlıyla aynı. Alttaki `return {outcome:'TIMEOUT', r:0, ...}`
// artık sadece window.length === 0 (hiç mum yok) durumunda devreye giriyor.
// Faz 2.2 (maker giriş modeli): sinyal fiyatında taker (market) girişi yerine,
// biraz daha iyi bir fiyatta (limit, post-only) bekleyen bir maker emrini simüle
// eder. Amaç: roundtrip maliyeti taker'ın (~0.0012) yerine maker'ın (~0.0004)
// olması — stop %2.5'te feeR 0.048R'den 0.016R'ye düşer. Karşılığında DOLMAMA
// RİSKİ vardır: fiyat MAKER_FILL_WINDOW mum içinde limit seviyesine hiç
// dönmeyebilir, bu durumda işlem hiç açılmaz (NO_FILL — kayıp yok ama fırsat da
// yok). Bu, aynı zamanda örtük bir GİRİŞ FİLTRESİDİR: sadece limit fiyatına geri
// çekilen (daha iyi) girişler gerçekleşir.
const MAKER_OFFSET_PCT = 0.0005; // limit, sinyal fiyatından %0.05 daha iyi
const MAKER_FILL_WINDOW = 10; // limit emrin dolması için beklenecek maksimum mum sayısı

function findMakerFill(window, direction, limitPrice) {
  const isLong = direction === 'long';
  const scanLimit = Math.min(window.length, MAKER_FILL_WINDOW);
  for (let i = 0; i < scanLimit; i++) {
    const { low, high } = window[i];
    // Limit emir dolar: LONG'da fiyat limitPrice'a veya altına inerse,
    // SHORT'ta fiyat limitPrice'a veya üstüne çıkarsa.
    const touched = isLong ? low <= limitPrice : high >= limitPrice;
    if (touched) return i;
  }
  return -1;
}

export function simulateTrade(setup, candles, fees = {}) {
  const { entryPrice, stopPrice, targetPrice, direction } = setup;
  const {
    takerFee = 0.0006, makerFee = 0.0002, slippagePct = 0.0003, exitSlippagePct = 0.0003,
    entryMode = 'taker',
  } = fees;

  const window = candles.slice(0, MAX_CANDLES);
  if (window.length === 0) {
    return { outcome: 'TIMEOUT', r: 0, durationMinutes: 0 };
  }

  const isLong = direction === 'long';

  let fillOffset = 0; // window içinde girişin fiilen dolduğu mum indeksi
  let simEntry;
  let effectiveFee;

  if (entryMode === 'maker') {
    const limitPrice = entryPrice * (isLong ? 1 - MAKER_OFFSET_PCT : 1 + MAKER_OFFSET_PCT);
    const fillIdx = findMakerFill(window, direction, limitPrice);
    if (fillIdx === -1) {
      return { outcome: 'NO_FILL', r: 0, durationMinutes: 0 };
    }
    fillOffset = fillIdx;
    simEntry = limitPrice; // limit emir → kayma yok, tam limit fiyatından dolar
    effectiveFee = makerFee;
  } else {
    // Canlı make-process-outcome-candle.js:43 ile aynı: giriş = sonraki mumun açılışı ± slippage
    simEntry = window[0].open * (isLong ? 1 + slippagePct : 1 - slippagePct);
    effectiveFee = takerFee;
  }

  const signal = {
    direction,
    entry_price: entryPrice,
    stop_price: stopPrice,
    target_price: targetPrice,
    signal_created_at: new Date(0).toISOString(),
  };

  const evalWindow = window.slice(fillOffset);
  for (let i = 0; i < evalWindow.length; i++) {
    const candle = evalWindow[i];
    const now = (i + 1) * CANDLE_MS;
    const result = evaluateOutcome(signal, candle, now, TIMEOUT_MS);
    if (!result) continue;

    const { simPnlR } = evaluateSimOutcome({
      direction,
      entryPrice,
      simEntry,
      stopPrice,
      targetPrice,
      status: result.status,
      exitPrice: result.exitPrice,
      takerFee: effectiveFee,
      exitSlippagePct,
    });

    const outcome = result.status === 'tp_hit' ? 'WIN' : result.status === 'sl_hit' ? 'LOSS' : 'TIMEOUT';
    return {
      outcome,
      r: simPnlR ?? 0,
      durationMinutes: fillOffset + i + 1,
      ...(result.tieBreak ? { tieBreak: true } : {}),
    };
  }

  return { outcome: 'TIMEOUT', r: 0, durationMinutes: evalWindow.length };
}
