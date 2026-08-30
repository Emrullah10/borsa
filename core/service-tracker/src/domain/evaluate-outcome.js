// Saf fonksiyon — DB/Redis bağımlılığı yok, kolayca test edilir

/**
 * Açık bir outcome için mum OHLC'ye göre sonuç değerlendir.
 * candle = { open, high, low, close }
 *
 * Aynı mumda hem SL hem TP range'i içindeyse SL önce geldi varsayılır —
 * scalp stopu tighttır ve konservatif olmak win-rate'i şişirmez.
 *
 * @returns {{ status, exitPrice, pnlR } | null}  null = sinyal hâlâ açık
 */
export function evaluateOutcome(signal, candle, now = Date.now(), timeoutMs = 4 * 60 * 60 * 1000) {
  const { direction, entry_price, stop_price, target_price, signal_created_at } = signal;
  const entry  = parseFloat(entry_price);
  const stop   = parseFloat(stop_price);
  const target = parseFloat(target_price);
  const risk   = Math.abs(entry - stop);

  const isLong = direction === 'long';
  const { high, low, close } = candle;

  const tpHit = isLong ? high >= target  : low  <= target;
  const slHit = isLong ? low  <= stop    : high >= stop;

  // SL öncelikli tie-break: aynı mumda ikisi de gerçekleştiyse SL kabul et
  if (slHit) {
    return { status: 'sl_hit', exitPrice: stop, pnlR: -1, ...(tpHit ? { tieBreak: true } : {}) };
  }
  if (tpHit) {
    const pnlR = risk > 0 ? Math.abs(target - entry) / risk : 0;
    return { status: 'tp_hit', exitPrice: target, pnlR: +pnlR.toFixed(4) };
  }

  const age = now - new Date(signal_created_at).getTime();
  // Faz 1.2 (B10 düzeltmesi): >= , sadece > değil — "süre dolunca" timeout sayılmalı,
  // "geçtikten SONRA" değil. Eskiden backtest simülatöründe (simulator.js) age
  // matematiksel olarak asla timeoutMs'i KESİN geçemiyordu (en fazla eşitleniyordu),
  // bu yüzden backtest'te timeout hep ayrı bir r:0 fallback'e düşüyordu (bedava timeout).
  if (age >= timeoutMs) {
    const pnlR = risk > 0 ? ((isLong ? 1 : -1) * (close - entry)) / risk : 0;
    return { status: 'timeout', exitPrice: close, pnlR: +pnlR.toFixed(4) };
  }

  return null; // hâlâ açık
}

/**
 * Çıkış kayması uygula (exit slippage).
 *
 * Stop tetiklendiğinde fiyat genelde seviyeden GEÇER (stop-through) — market
 * emriyle kapanır, gerçek dolum stop'tan kötüdür. Timeout da market kapanışıdır.
 * TP ise limit emirle dolar → kayma yoktur.
 *
 * Bu modellenmediğinde ölçülen edge SİSTEMATİK olarak yukarı sapar; kayma
 * sadece kaybeden tarafa vurduğu için hata tek yönlüdür.
 */
function applyExitSlippage(status, exitPrice, isLong, exitSlippagePct) {
  if (!exitSlippagePct || status === 'tp_hit') return exitPrice;
  // Aleyhe yön: long'da çıkış aşağı, short'ta yukarı kayar
  return exitPrice * (isLong ? 1 - exitSlippagePct : 1 + exitSlippagePct);
}

// Timeframe başına mum aralığı (ms) — sim-giriş tazelik kontrolü için.
// core/service-signal-engine/src/application/use-cases/make-process-candle.js:13
// içindeki TF_MS ile aynı kaynak; burada tekrarlanıyor çünkü tracker o modüle
// bağımlı değil (ayrı servis).
export const TF_MS = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '4h': 14_400_000 };

/**
 * Sim-giriş için kullanılacak mumun "kabul edilebilir taze" olup olmadığını
 * belirler (Faz 0.2, B2 düzeltmesi).
 *
 * NEDEN VAR: `sim_entry_price` daha önce yaş kontrolü olmadan Redis'ten gelen
 * HERHANGİ bir muma göre yazılıyordu. Haftalarca eski `pending` satırlar
 * (bkz. B13 — zombi pending) güncel mumlarla eşleşince sim-giriş gerçek
 * sinyal fiyatından ortalama %4.97 sapıyordu (modellenen slippage %0.03'e
 * karşı — 165 kat). Bu, B1/B3'teki R-birimi bozulmasının kök nedeniydi.
 *
 * Kabul kriteri: mum, sinyalin oluşma zamanından SONRA VE mumun kendi zaman
 * damgası, "şimdi"ye göre tfMs×2'den daha eski değil (WS akışı kopmuşsa aynı
 * korumayı sinyal tarafında sağlayan staleness.js ile aynı desen).
 *
 * @param {{signalCreatedAt: string|number, candleTs: number|null|undefined, tf?: string, now?: number}} p
 * @returns {boolean} true = bu mumdan sim-giriş yazılabilir
 */
export function isSimEntryFillable({ signalCreatedAt, candleTs, tf, now = Date.now() }) {
  // Mum zaman damgası taşımıyorsa (eski entegrasyon/test) eski davranışı koru —
  // ama gerçek üretim yolunda candle-buffer.js her zaman ts üretir.
  if (candleTs == null) return true;

  const signalTs = new Date(signalCreatedAt).getTime();
  if (Number.isFinite(signalTs) && candleTs < signalTs) return false; // sinyalden ÖNCEki mum olamaz

  const tfMs = TF_MS[tf] ?? TF_MS['1m'];
  if ((now - candleTs) > tfMs * 2) return false; // "şimdi"ye göre bayat

  return true;
}

/**
 * Paper-trading: gerçekçi sim giriş fiyatına göre R hesapla.
 * simEntry = sinyalden sonraki ilk 1m mumun açılışı ± slippage (tracker'da hesaplanır).
 *
 * Faz 0.1 düzeltmesi (B1/B3, 2026-08-29): risk birimi artık SİNYALİN PLANLANAN
 * riskinden (|entryPrice - stopPrice|) hesaplanır, simEntry'den YENİDEN ÖLÇÜLMÜYOR.
 * Eski `Math.abs(simEntry - stopPrice)` paydası iki hataya yol açıyordu:
 *   1. simEntry stopPrice'ın ÖTESİNE düşerse (bayat sim-giriş, bkz. B2) Math.abs
 *      paydayı pozitif tutuyor ama pay işaret değiştiriyor → SL zararı canlı DB'de
 *      137 satırda +1R KÂR olarak yazılmıştı.
 *   2. R birimi işlemler arası 134× değişiyordu (simRisk/realRisk oranı) — bu
 *      sayıların ortalamasını almak istatistiksel olarak anlamsızdı.
 * simEntry stop'un ötesindeyse (fiilen doldurulamazdı — piyasa emri stop'tan önce
 * tetiklenirdi) simPnlR NULL döner, reason:'unfillable' ile işaretlenir.
 *
 * @param {number} entryPrice - sinyaldeki planlanan giriş fiyatı (risk birimi buradan)
 * @param {number} [exitSlippagePct] - verilmezse çıkış kayması uygulanmaz (geriye uyumlu)
 * @returns {{ simPnlR: number|null, reason?: string }}
 */
export function evaluateSimOutcome({ direction, entryPrice, simEntry, stopPrice, targetPrice, status, exitPrice, takerFee, exitSlippagePct }) {
  if (simEntry == null) return { simPnlR: null };

  const isLong = direction === 'long';
  const riskUnit = Math.abs(entryPrice - stopPrice);
  if (riskUnit <= 0) return { simPnlR: null };

  // simEntry stop'un ÖTESİNDEYSE (long'da stop'un altında, short'ta üstünde)
  // pozisyon fiilen doldurulamazdı — stop piyasa emri girişten önce tetiklenirdi.
  const beyondStop = isLong ? simEntry <= stopPrice : simEntry >= stopPrice;
  if (beyondStop) return { simPnlR: null, reason: 'unfillable' };

  const realExit = applyExitSlippage(status, exitPrice, isLong, exitSlippagePct);

  const grossR = ((isLong ? 1 : -1) * (realExit - simEntry)) / riskUnit;
  const feeR = (2 * takerFee * simEntry) / riskUnit;

  return { simPnlR: +(grossR - feeR).toFixed(4) };
}
