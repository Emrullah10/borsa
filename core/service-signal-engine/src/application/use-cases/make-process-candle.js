import { calcAllIndicators } from '../../domain/indicators.js';
import { commitCandle } from '../../domain/candle-buffer.js';
import { calcLiquidationPressure } from '../../domain/liquidation-pressure.js';
import { calcConfluence } from '../../domain/confluence.js';
import { calcRegime, calcHigherTfTrend } from '../../domain/regime.js';
import { applyEntryFilters } from '../../domain/entry-filters.js';
import { buildSetup } from '../../domain/setup-builder.js';

const CANDLE_BUFFER_SIZE = 60;
// TF bazlı cooldown: 1m → 60dk, 5m → 120dk
// Eski değerler (10dk/30dk) günde ~666 sinyal üretiyordu — fee yükü edge'den büyüktü.
// Yeni değerler günde ~5-15 sinyal hedefliyor (kalite > miktar).
const COOLDOWN_BY_TF = { '1m': 60 * 60 * 1000, '5m': 120 * 60 * 1000 };
const SIGNAL_COOLDOWN_MS = 60 * 60 * 1000; // fallback
// Min stop %2.5: eski %1.2-1.4 stop normal piyasa gürültüsünde 2dk'da vuruluyordu.
// Daha geniş stop = daha az noise-triggered kayıp = daha yüksek WR.
const MIN_STOP_PCT_BY_TF = { '1m': 0.025, '5m': 0.025 };

export function makeProcessCandle({
  signalRepo, publish, log, confluenceThreshold, filterParams,
  requireSrCap = false, atrStopMult, targetRR,
}) {
  const candleBuffers = {};   // { 'BTCUSDT.1m': Candle[] } — sadece KAPANMIŞ mumlar
  const formingCandles = {};  // { 'BTCUSDT.1m': Candle } — hâlâ oluşan (henüz kapanmamış) mum
  const marketState = {};     // { 'BTCUSDT': { funding, oi, lsr } }
  const lastSignalTs = {};    // cooldown tracking
  const signalLocks = {};     // per-symbol async lock (race condition önlemi)
  const filterRejectCounts = {}; // { 'overextension': n, 'adx-exhaustion': n } — gözlemlenebilirlik

  let _currentRegime = 'neutral';

  function getCurrentRegime() { return _currentRegime; }

  // Sadece buffer'ı güncelle, sinyal üretme (15m için)
  function updateBufferOnly(symbol, tf, data) {
    const bufKey = `${symbol}.${tf}`;
    const { buffer, forming } = commitCandle({
      buffer: candleBuffers[bufKey] ?? [],
      forming: formingCandles[bufKey] ?? null,
      incoming: data,
      maxSize: CANDLE_BUFFER_SIZE,
    });
    candleBuffers[bufKey] = buffer;
    formingCandles[bufKey] = forming;
  }

  // Bir sembol için market state'i yoksa oluştur (lazy)
  function ensureState(symbol) {
    if (!marketState[symbol]) {
      marketState[symbol] = {
        funding: { rate: 0, nextTs: 0 },
        oi: { oi: 0, oiDelta: 0 },
        lsr: { longRatio: 0.5, shortRatio: 0.5 },
      };
    }
    return marketState[symbol];
  }

  // 5m buffer'ından EMA9/EMA21 trend yönünü döner; veri yoksa null
  function getHigherTfTrend(symbol, tf = '5m') {
    const buf = candleBuffers[`${symbol}.${tf}`];
    if (!buf) return null;
    return calcHigherTfTrend(buf.map(c => c.close));
  }

  async function handleMessage(channel, msg, { onSignal } = {}) {
    const { type, symbol, data } = msg;

    if (type === 'funding') {
      ensureState(symbol).funding = data;
      return;
    }
    if (type === 'oi') {
      const st = ensureState(symbol);
      const prev = st.oi?.oi ?? 0;
      st.oi = { oi: data.oi, oiDelta: data.oi - prev };
      return;
    }
    if (type === 'lsr') {
      ensureState(symbol).lsr = data;
      return;
    }
    if (type !== 'candle') return;

    const tf = msg.tf;
    // 15m ve 4h sadece teyit/rejim için kullanılır, sinyal üretmez
    if (tf === '15m' || tf === '4h') { updateBufferOnly(symbol, tf, data); return; }
    const bufKey = `${symbol}.${tf}`;
    // Bitget WS mum henüz kapanmadan da (her tick'te) güncelleme gönderir —
    // gösterge/sinyal zincirini SADECE mum gerçekten kapandığında çalıştır.
    // Aksi halde ATR/RSI/ADX gibi seri-bağımlı göstergeler ara tick'lerle
    // kirlenir (bkz. core/service-signal-engine/src/domain/candle-buffer.js).
    const { buffer, forming, closedCandle } = commitCandle({
      buffer: candleBuffers[bufKey] ?? [],
      forming: formingCandles[bufKey] ?? null,
      incoming: data,
      maxSize: CANDLE_BUFFER_SIZE,
    });
    candleBuffers[bufKey] = buffer;
    formingCandles[bufKey] = forming;
    if (!closedCandle) return; // hâlâ oluşuyor, henüz değerlendirme yok

    const candles = candleBuffers[bufKey];
    if (candles.length < 50) return; // ADX güvenilir hesaplamak için yeterli mum

    const indicators = calcAllIndicators(candles);
    indicators.currentPrice = closedCandle.close;

    const state = ensureState(symbol);
    const prevClose = candles.length > 1 ? candles[candles.length - 2].close : closedCandle.close;
    const priceChange = prevClose > 0 ? (closedCandle.close - prevClose) / prevClose : 0;

    const liqPressure = calcLiquidationPressure({
      fundingRate:  state.funding?.rate ?? 0,
      oiDelta:      state.oi?.oiDelta ?? 0,
      longRatio:    state.lsr?.longRatio ?? 0.5,
      shortRatio:   state.lsr?.shortRatio ?? 0.5,
      priceChange,
    });

    // Piyasa rejimi: BTC 4h trendi (ana piyasa yönü)
    const btc4hBuf = candleBuffers['BTCUSDT.4h'] ?? [];
    const regime = calcRegime(btc4hBuf);
    _currentRegime = regime;

    // 1m sinyalleri için 5m trend teyidi al; diğer TF'ler için null (gate atlanır)
    const higherTfTrend = tf === '1m' ? getHigherTfTrend(symbol, '5m') : null;
    const confluence = calcConfluence(indicators, liqPressure, confluenceThreshold, higherTfTrend, regime);
    if (!confluence.isCandidate) return;

    // Giriş kalite filtreleri: aşırı-uzama (band tepesinden long/dibinden short)
    // ve ADX tükenme tavanı. Bkz. core/service-signal-engine/src/domain/entry-filters.js
    const filterResult = applyEntryFilters({ direction: confluence.direction, indicators, params: filterParams });
    if (!filterResult.allowed) {
      filterRejectCounts[filterResult.reason] = (filterRejectCounts[filterResult.reason] ?? 0) + 1;
      log.debug(`Entry filtered: ${symbol} ${confluence.direction} reason=${filterResult.reason} (toplam ${filterResult.reason}: ${filterRejectCounts[filterResult.reason]})`);
      return;
    }

    // Per-symbol lock: aynı anda iki TF'den sinyal üretilmesini önler (async race condition)
    if (signalLocks[symbol]) return;
    signalLocks[symbol] = true;

    try {
    // %1 minimum hedef filtresi + dinamik R/R — cooldown'dan ÖNCE
    // Takılan sinyal cooldown başlatmasın; volatilite artınca aynı coin tekrar denenebilsin
    const setup = buildSetup({
      direction: confluence.direction,
      currentPrice: closedCandle.close,
      atr: indicators.atr,
      supportLevel: indicators.supportLevel,
      resistanceLevel: indicators.resistanceLevel,
      minStopPct: MIN_STOP_PCT_BY_TF[tf] ?? 0.012,
      requireSrCap,
      ...(atrStopMult != null ? { atrStopMult } : {}),
      ...(targetRR != null ? { targetRR } : {}),
    });
    if (!setup.meetsMinTarget) {
      log.debug(`Min target not met: ${symbol} targetPct=${(setup.targetPct * 100).toFixed(3)}%`);
      return;
    }
    if (!setup.meetsMinRR) {
      log.debug(`Min RR not met: ${symbol} rrRatio=${setup.rrRatio} (S/R capped)`);
      return;
    }
    if (!setup.meetsFeeFloor) {
      log.debug(`Fee floor not met: ${symbol} stopPct=${(setup.stopPct * 100).toFixed(3)}% feeR=${setup.feeR} netRR=${(setup.rrRatio - setup.feeR).toFixed(2)}`);
      return;
    }
    if (!setup.meetsSrCapRequirement) {
      log.debug(`S/R cap gerekli ama yok: ${symbol} ${confluence.direction} — "açık sahada" hedef reddedildi`);
      return;
    }

    // Cooldown: sembol bazlı — TF'e göre farklı süre (1m:10dk, 5m:30dk)
    const cooldownMs = COOLDOWN_BY_TF[tf] ?? SIGNAL_COOLDOWN_MS;
    const now = Date.now();
    if (lastSignalTs[symbol] && now - lastSignalTs[symbol] < cooldownMs) {
      log.debug(`Cooldown active: ${symbol}`);
      return;
    }
    lastSignalTs[symbol] = now;

    const signal = await signalRepo.saveSignal({
      symbol,
      direction: confluence.direction,
      triggerTimeframe: tf,
      entryPrice: setup.entryPrice,
      stopPrice: setup.stopPrice,
      targetPrice: setup.targetPrice,
      rrRatio: setup.rrRatio,
      confluenceScore: confluence.score,
      indicatorsSnapshot: indicators,
      liqPressureScore: liqPressure.score,
      liqDirection: liqPressure.direction,
      regime,
      higherTfTrend,
    });
    await signalRepo.createOutcome(signal.id);

    onSignal?.({
      id: signal.id,
      symbol,
      direction: confluence.direction,
      triggerTimeframe: tf,
      entryPrice: setup.entryPrice,
      stopPrice: setup.stopPrice,
      targetPrice: setup.targetPrice,
      rrRatio: setup.rrRatio,
      confluenceScore: confluence.score,
      indicatorsSnapshot: indicators,
      createdAt: signal.created_at,
    });

    log.info(
      `✅ NEW SIGNAL: ${symbol} ${confluence.direction.toUpperCase()} | TF:${tf}` +
      ` | Score:${confluence.score.toFixed(3)} | Entry:${setup.entryPrice}` +
      ` | Stop:${setup.stopPrice} | Target:${setup.targetPrice} | RR:${setup.rrRatio}`
    );

    // Publish to signals.new for notifier service
    await publish(
      'signals.new',
      JSON.stringify({
        signalId: signal.id,
        symbol,
        direction: confluence.direction,
        ...setup,
        confluenceScore: confluence.score,
        createdAt: new Date().toISOString(),
      }),
    );

    } finally {
      signalLocks[symbol] = false;
    }
  }

  return { handleMessage, getCurrentRegime };
}
