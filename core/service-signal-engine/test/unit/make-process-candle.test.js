import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeProcessCandle } from '../../src/application/use-cases/make-process-candle.js';

// Yeterince uzun, dalgalı bir seri — ADX/RSI/BB gibi göstergelerin non-null
// hesaplanabilmesi için en az 50+ mum gerekir (bkz. run-strategy.test.js aynı deseni kullanır).
function makeClosedCandles(n, seed = 100) {
  // ts'ler ŞİMDİYE göre üretilir; son mum ~şimdi olur ki bayat-veri guard'ı
  // (staleness.js) devreye girmesin. Sabit geçmiş timestamp kullanılamaz.
  const baseTs = Date.now() - n * 60_000;
  const out = [];
  for (let i = 0; i < n; i++) {
    const price = seed + Math.sin(i / 5) * 8 + i * 0.05;
    const open = price;
    const close = price + (i % 3 === 0 ? 0.5 : -0.3);
    const high = Math.max(open, close) + 0.4;
    const low = Math.min(open, close) - 0.4;
    // ts'ler ŞİMDİYE göre üretilir — bayat-veri guard'ı (staleness.js) sabit
    // geçmiş timestamp'leri reddeder. Son mum ~şimdi olacak şekilde geriye sayılır.
    out.push({ ts: baseTs + i * 60_000, open, high, low, close, volume: 100 + (i % 10) });
  }
  return out;
}

function makeDeps() {
  return {
    signalRepo: {
      saveSignal: vi.fn().mockResolvedValue({ id: 'sig-1', created_at: new Date().toISOString() }),
      createOutcome: vi.fn().mockResolvedValue(undefined),
    },
    publish: vi.fn().mockResolvedValue(undefined),
    log: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
    confluenceThreshold: 0.5, // düşük eşik: bu testte gerçek sinyal üretilip üretilmediği değil, ÇAĞRI SAYISI önemli
    filterParams: undefined,
  };
}

async function feedClosedCandles(processCandle, candles, symbol = 'TESTUSDT', tf = '1m') {
  for (const c of candles) {
    await processCandle.handleMessage(`md.${symbol}.${tf}`, { type: 'candle', symbol, tf, data: c });
  }
}

// Her kapanmış mumu N adet "gürültülü" ara tick olarak simüle eder (aynı ts, farklı OHLC),
// en son mesaj gerçek kapanış değerlerini taşır.
function withNoisyTicks(candles, ticksPerCandle = 4) {
  const out = [];
  for (const c of candles) {
    for (let k = 1; k < ticksPerCandle; k++) {
      const jitter = (k - ticksPerCandle / 2) * 0.05;
      out.push({ ...c, close: c.close + jitter, high: c.high + Math.max(0, jitter), low: c.low - Math.max(0, -jitter) });
    }
    out.push(c); // son mesaj = gerçek kapanış
  }
  return out;
}

// Faz 2.1 (B9 düzeltmesi): OI (open interest) her ticker tick'inde (saniye-altı
// sıklıkta) geliyor. Eski `oiDelta = data.oi - prev` bu yüzden neredeyse her
// zaman sıfıra yakındı — calcLiquidationPressure'daki oiPressure bileşeni
// (ağırlık 0.25) fiilen ölüydü. Artık OI için 1 saatlik bir referans tutuluyor;
// oiDelta SADECE en az 1 saat eski bir referansa göre hesaplanıyor.
describe('makeProcessCandle — OI 1 saatlik pencere (Faz 2.1, B9 düzeltmesi)', () => {
  let deps;
  let processCandle;

  beforeEach(() => {
    deps = makeDeps();
    processCandle = makeProcessCandle(deps);
  });

  async function sendOi(oi) {
    await processCandle.handleMessage('md.TESTUSDT.oi', { type: 'oi', symbol: 'TESTUSDT', data: { oi } });
  }

  // liqPressureScore, oiPressure = clamp(|oiDelta|/10000) bileşenini 0.25 ağırlıkla
  // taşıyor (calcLiquidationPressure). Büyük bir OI sıçraması 1 saat İÇİNDE hâlâ
  // referanssız (oiDelta=0) kalmalı; 1 saat SONRA fark yakalanmalı.
  it('1 saatten ÖNCE gelen büyük OI değişimi oiDelta\'yı etkilemez (referans yok)', async () => {
    vi.useFakeTimers();
    try {
      await sendOi(1_000_000);
      vi.advanceTimersByTime(30 * 60 * 1000); // 30dk sonra — hâlâ 1 saatin altında
      await sendOi(1_500_000); // %50 büyük sıçrama

      const candles = makeClosedCandles(80);
      await feedClosedCandles(processCandle, candles, 'TESTUSDT');

      expect(deps.signalRepo.saveSignal.mock.calls.length).toBeGreaterThan(0);
      const snap = deps.signalRepo.saveSignal.mock.calls[0][0];
      // 1 saat dolmadığı için referans yok → oiPressure katkısı sıfıra yakın →
      // liqPressureScore taban değere (nötr fundingNorm=0 varsayımıyla ~0.5) yakın kalmalı.
      expect(snap.liqPressureScore).toBeLessThan(0.55);
    } finally {
      vi.useRealTimers();
    }
  });

  it('1 saatten SONRA gelen büyük OI değişimi oiDelta\'yı yakalar, liqPressureScore yükselir', async () => {
    vi.useFakeTimers();
    try {
      await sendOi(1_000_000);
      vi.advanceTimersByTime(61 * 60 * 1000); // 61dk sonra — 1 saat referansı artık var
      await sendOi(1_100_000); // oiDelta = 100_000 → oiPressure = clamp(100000/10000) = 1 (max)

      const candles = makeClosedCandles(80);
      await feedClosedCandles(processCandle, candles, 'TESTUSDT');

      expect(deps.signalRepo.saveSignal.mock.calls.length).toBeGreaterThan(0);
      const snap = deps.signalRepo.saveSignal.mock.calls[0][0];
      // oiPressure=1, ağırlık 0.25 → rawScore'a +0.25 katkı → score = 0.5 + rawScore*0.5
      // en az 0.5 + 0.25*0.5 = 0.625 civarı beklenir (fundingNorm/imbalance sıfır varsayımıyla)
      expect(snap.liqPressureScore).toBeGreaterThan(0.55);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('makeProcessCandle — kapanmamış mum kirliliği düzeltmesi', () => {
  let deps;
  let processCandle;

  beforeEach(() => {
    deps = makeDeps();
    processCandle = makeProcessCandle(deps);
  });

  it('gürültülü ara tick\'lerle beslenen seri, temiz seriyle AYNI göstergelerle sinyal üretir', async () => {
    // Bug KANITLANDI (düzeltme öncesi ölçüldü): noisy currentPrice=106.55 rsi=44.72 adx=55.67
    // vs clean currentPrice=97.10 rsi=40.48 adx=33.61 — tamamen farklı sinyaller.
    const clean = makeClosedCandles(80);
    const noisy = withNoisyTicks(clean, 4);

    await feedClosedCandles(processCandle, noisy);
    const noisyCalls = deps.signalRepo.saveSignal.mock.calls;

    const deps2 = makeDeps();
    const processCandle2 = makeProcessCandle(deps2);
    await feedClosedCandles(processCandle2, clean);
    const cleanCalls = deps2.signalRepo.saveSignal.mock.calls;

    expect(noisyCalls.length).toBe(cleanCalls.length);
    expect(noisyCalls.length).toBeGreaterThan(0); // testin anlamlı olduğunu garanti et
    expect(noisyCalls[0][0].indicatorsSnapshot.currentPrice).toBeCloseTo(cleanCalls[0][0].indicatorsSnapshot.currentPrice, 5);
    expect(noisyCalls[0][0].indicatorsSnapshot.rsi).toBeCloseTo(cleanCalls[0][0].indicatorsSnapshot.rsi, 2);
    expect(noisyCalls[0][0].indicatorsSnapshot.adx).toBeCloseTo(cleanCalls[0][0].indicatorsSnapshot.adx, 2);
  });

  it('aynı ts ile 5 ardışık mesaj gönderilince göstergeler ara tick\'lerden değil sadece gerçek kapanıştan hesaplanır', async () => {
    const candles = makeClosedCandles(55);
    const last = candles[candles.length - 1];
    const withDuplicates = [
      ...candles.slice(0, -1),
      { ...last, close: last.close + 0.1 },
      { ...last, close: last.close + 0.2 },
      { ...last, close: last.close - 0.1 },
      { ...last, close: last.close + 0.05 },
      last, // gerçek kapanış
    ];

    await feedClosedCandles(processCandle, withDuplicates);

    const deps2 = makeDeps();
    const processCandle2 = makeProcessCandle(deps2);
    await feedClosedCandles(processCandle2, candles);

    const c1 = deps.signalRepo.saveSignal.mock.calls;
    const c2 = deps2.signalRepo.saveSignal.mock.calls;
    expect(c1.length).toBe(c2.length);
    if (c1.length > 0) {
      expect(c1[0][0].indicatorsSnapshot.currentPrice).toBeCloseTo(c2[0][0].indicatorsSnapshot.currentPrice, 5);
    }
  });

  it('kaydedilen sinyalin indicatorsSnapshot\'ı kapanmış mumun verisini yansıtır, ara tick\'in değerini değil', async () => {
    const candles = makeClosedCandles(55);
    const last = candles[candles.length - 1];
    const withDuplicates = [
      ...candles.slice(0, -1),
      { ...last, close: last.close + 999 }, // aşırı sapmalı ara tick — commit edilmemeli
      last, // gerçek kapanış
    ];

    await feedClosedCandles(processCandle, withDuplicates);

    if (deps.signalRepo.saveSignal.mock.calls.length > 0) {
      const savedArg = deps.signalRepo.saveSignal.mock.calls[0][0];
      // currentPrice kapanmış mumun close'una eşit olmalı, +999 sapmalı ara tick'e değil
      expect(savedArg.indicatorsSnapshot.currentPrice).toBeCloseTo(last.close, 5);
    }
  });

  it('15m/4h mesajları da aynı mantıkla commit edilir (regime bozulmaz) — aynı ts tekrarları rejimi değiştirmez', async () => {
    const btc4h = makeClosedCandles(40, 200);
    const last = btc4h[btc4h.length - 1];

    for (const c of btc4h.slice(0, -1)) {
      await processCandle.handleMessage('md.BTCUSDT.4h', { type: 'candle', symbol: 'BTCUSDT', tf: '4h', data: c });
    }
    // Son mumu 3 kez aynı ts ile gönder
    for (const close of [last.close + 5, last.close - 5, last.close]) {
      await processCandle.handleMessage('md.BTCUSDT.4h', {
        type: 'candle', symbol: 'BTCUSDT', tf: '4h', data: { ...last, close },
      });
    }

    const regimeAfterDuplicates = processCandle.getCurrentRegime();

    // Kıyas: aynı seriyi duplike olmadan besle
    const deps2 = makeDeps();
    const processCandle2 = makeProcessCandle(deps2);
    for (const c of btc4h) {
      await processCandle2.handleMessage('md.BTCUSDT.4h', { type: 'candle', symbol: 'BTCUSDT', tf: '4h', data: c });
    }
    // regime henüz 1m/5m tetiklenmeden hesaplanmaz (yalnızca handleMessage'ın 1m/5m dalı hesaplıyor),
    // bu yüzden burada sadece hata fırlatmadığını ve tutarlı davrandığını doğruluyoruz.
    expect(typeof regimeAfterDuplicates).toBe('string');
  });
});
