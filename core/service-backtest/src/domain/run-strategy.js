import { calcAllIndicators } from '@borsa-bot/core-signal-engine/src/domain/indicators.js';
import { calcLiquidationPressure } from '@borsa-bot/core-signal-engine/src/domain/liquidation-pressure.js';
import { calcConfluence } from '@borsa-bot/core-signal-engine/src/domain/confluence.js';
import { calcRegime, calcHigherTfTrend } from '@borsa-bot/core-signal-engine/src/domain/regime.js';
import { applyEntryFilters } from '@borsa-bot/core-signal-engine/src/domain/entry-filters.js';
import { buildSetup } from '@borsa-bot/core-signal-engine/src/domain/setup-builder.js';
import { interpolateFunding } from '../infrastructure/fetcher.js';
import { simulateTrade } from './simulator.js';

// Parite düzeltmesi (2026-08-20): canlıdaki COOLDOWN_BY_TF['1m'] = 60dk ile eşitlendi.
// Eski 5dk cooldown backtest'in ~13× fazla sinyal üretmesine yol açıyordu → şişirilmiş metrikler.
const COOLDOWN_MS = 60 * 60 * 1000;
// Parite: canlıdaki MIN_STOP_PCT_BY_TF['1m'] = 0.025 ile eşitlendi.
const DEFAULT_MIN_STOP_PCT = 0.025;

// Canlı make-process-candle.js ile birebir aynı karar zinciri (parite kritik):
// indicators → liqPressure → regime/higherTfTrend → confluence → entry-filters
// → cooldown → buildSetup (supportLevel/resistanceLevel/minStopPct dahil)
// → simulateTrade. Pure — sweep.js bu fonksiyonu farklı threshold/filterParams
// kombinasyonlarıyla aynı mum verisi üzerinde tekrar çağırır.
//
// NOT (2026-07-13 düzeltildi): bu fonksiyon önceden buildSetup'a supportLevel/
// resistanceLevel/minStopPct geçirmiyordu — canlıda S/R kapağı hedefi kırpıp
// rrRatio'yu düşürebiliyor, backtest'te bu hiç olmuyordu. Bu, sweep sonuçlarının
// gerçek canlı davranışı yanlış simüle etmesine yol açan bir parite kopukluğuydu.
export function runStrategyOverCandles({
  candles, fundingHistory, regimeBuffer, higherTfBuffer,
  window, threshold, symbol, filterParams, minStopPct = DEFAULT_MIN_STOP_PCT, requireSrCap = false,
  atrStopMult, targetRR, fees,
}) {
  if (candles.length < window) return [];

  // Kapı/muhasebe tutarlılığı — canlı boot.js ile AYNI formül (Faz 0.2).
  // fees verilmezse buildSetup kendi varsayılanını kullanır (geriye uyumlu).
  const feeRoundtrip = fees
    ? 2 * (fees.takerFee ?? 0.0006) + (fees.slippagePct ?? 0.0003) + (fees.exitSlippagePct ?? 0.0003)
    : undefined;

  const trades = [];
  const cooldowns = new Map();

  for (let i = window; i < candles.length; i++) {
    // Faz 1.3 (B11 düzeltmesi): canlı make-process-candle.js:122'de calcAllIndicators
    // KAPANAN mumu (closedCandle) İÇEREN buffer'la çağrılıyor (commitCandle onu buffer'a
    // ekledikten SONRA). Eski `candles.slice(i-window, i)` candles[i]'yi (o an işlenen
    // mum) dışlıyordu — göstergeler canlıdan 1 bar geride hesaplanıyordu ama giriş
    // fiyatı yine de candles[i].close'du. Artık pencere candles[i]'yi İÇERİYOR.
    const win = candles.slice(i - window + 1, i + 1);
    const current = candles[i];

    const indicators = calcAllIndicators(win);
    indicators.currentPrice = current.close;

    const funding = interpolateFunding(current.timestamp, fundingHistory);

    // BİLİNEN SAPMA (B7, 2026-08-20 doğrulama araştırması): Bitget'in tarihsel
    // OI/uzun-kısa oranı verisi kolay çekilemediği için oiDelta/longRatio/shortRatio
    // burada nötr sabitlerle besleniyor — canlıda gerçek OI/LSR kullanılıyor
    // (core/service-signal-engine/.../make-process-candle.js). confluence skorunun
    // liq bileşeni backtest'te her zaman nötr çıkar; canlıda ±(liq ağırlığı kadar)
    // sapabilir. Düzeltme değil, ölçülü bir kısıtlama: sweep sonuçları liq
    // bileşeninin etkisini yakalayamaz.
    //
    // Faz 1.3 (P2 düzeltmesi): priceChange artık win'in SON İKİ elemanından (1 barlık
    // fark) hesaplanıyor — win artık candles[i]'yi içerdiği için win[win.length-1] ===
    // current. Canlı make-process-candle.js:126-127 ile aynı: (closedCandle.close -
    // candles[len-2].close). Eski kod candles[i]'yi win DIŞINDA tutup current ile
    // win[win.length-2]'yi (candles[i-2]) karşılaştırıyordu — 2 barlık fark.
    const liqPressure = calcLiquidationPressure({
      fundingRate:  funding,
      oiDelta:      0,
      longRatio:    0.5,
      shortRatio:   0.5,
      priceChange:  win.length > 1
        ? (current.close - win[win.length - 2].close) / win[win.length - 2].close
        : 0,
    });

    const regime = calcRegime(regimeBuffer.at(current.timestamp));
    const higherTfTrend = calcHigherTfTrend(higherTfBuffer.at(current.timestamp).map(c => c.close));

    const confluence = calcConfluence(indicators, liqPressure, threshold, higherTfTrend, regime);
    if (!confluence.isCandidate) continue;

    const direction = confluence.direction;

    const filterResult = applyEntryFilters({ direction, indicators, params: filterParams });
    if (!filterResult.allowed) continue;

    if (!indicators.atr || indicators.atr === 0) continue;

    const setup = buildSetup({
      direction,
      currentPrice: current.close,
      atr: indicators.atr,
      supportLevel: indicators.supportLevel,
      resistanceLevel: indicators.resistanceLevel,
      minStopPct,
      requireSrCap,
      ...(atrStopMult != null ? { atrStopMult } : {}),
      ...(targetRR != null ? { targetRR } : {}),
      ...(feeRoundtrip != null ? { feeRoundtrip } : {}),
    });

    // Canlı make-process-candle.js'nin meetsMinTarget/meetsMinRR/meetsFeeFloor/
    // meetsSrCapRequirement gate'leriyle parite (önceden backtest bunları hiç
    // kontrol etmiyordu — her setup simüle ediliyordu, canlıda reddedilecek
    // olanlar dahil).
    if (!setup.meetsMinTarget || !setup.meetsMinRR || !setup.meetsFeeFloor || !setup.meetsSrCapRequirement) {
      continue;
    }

    // Faz 1.3 (P6 düzeltmesi): cooldown artık diğer TÜM gate'lerden SONRA kontrol
    // ediliyor — canlı make-process-candle.js:161-199 ile aynı sıra. Eskiden backtest
    // cooldown'u buildSetup gate'lerinden ÖNCE uyguluyordu; canlıda ise reddedilen
    // ("takılan") bir setup cooldown BAŞLATMAZ — böylece volatilite artınca aynı coin
    // hemen tekrar denenebilir (bkz. make-process-candle.js:161-162 yorumu). Eski sıra
    // backtest'in canlıdan daha AZ sinyal üretmesine yol açıyordu.
    const lastSignal = cooldowns.get(symbol) ?? 0;
    if (current.timestamp - lastSignal < COOLDOWN_MS) continue;
    cooldowns.set(symbol, current.timestamp);

    const remainingCandles = candles.slice(i + 1);
    const result = simulateTrade(setup, remainingCandles, fees);

    trades.push({
      symbol,
      direction,
      timestamp: current.timestamp,
      entryPrice: setup.entryPrice,
      stopPrice: setup.stopPrice,
      targetPrice: setup.targetPrice,
      rrRatio: setup.rrRatio,
      srCapped: setup.srCapped,
      confluenceScore: confluence.score,
      regime,
      higherTfTrend,
      ...result,
    });
  }

  return trades;
}
