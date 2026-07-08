import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { calcAllIndicators } from './indicators.js';
import { calcLiquidationPressure } from './liquidation-pressure.js';
import { calcConfluence } from './confluence.js';
import { calcRegime } from './regime.js';
import { buildSetup } from './setup-builder.js';
import { saveSignal, createOutcome } from './signal-repository.js';

const CANDLE_BUFFER_SIZE = 60;
// TF bazlı cooldown: 1m → 10dk, 5m → 30dk (her TF'in mum süresinin 6×)
const COOLDOWN_BY_TF = { '1m': 10 * 60 * 1000, '5m': 30 * 60 * 1000 };
const SIGNAL_COOLDOWN_MS = 10 * 60 * 1000; // fallback
// 1m daha dar stop eğilimliydi → daha sıkı fee floor; 5m baseline'a eşit tutuldu
const MIN_STOP_PCT_BY_TF = { '1m': 0.014, '5m': 0.012 };

const candleBuffers = {};   // { 'BTCUSDT.1m': Candle[] }
const marketState = {};     // { 'BTCUSDT': { funding, oi, lsr } }
const lastSignalTs = {};    // cooldown tracking
const signalLocks = {};     // per-symbol async lock (race condition önlemi)

let _currentRegime = 'neutral';
export function getCurrentRegime() { return _currentRegime; }

export async function startSubscriber(config, onSignal) {
  const subRedis = datasources.coreRedis.duplicate();

  const { rows: watchlist } = await datasources.postgres.query(
    'SELECT symbol, timeframes FROM watchlist WHERE active = true'
  );
  const { rows: configRows } = await datasources.postgres.query(
    "SELECT key, value FROM bot_config WHERE key IN ('confluence_threshold','rr_min')"
  );
  const cfg = Object.fromEntries(configRows.map(r => [r.key, r.value]));
  const confluenceThreshold = parseFloat(cfg.confluence_threshold ?? 0.65);

  // Tüm coin'leri otomatik izle: watchlist tablosuna bağlı kalmak yerine
  // market-data'nın yayınladığı her 'md.*' kanalını pattern-subscribe ile yakala.
  // Böylece MARKET_DATA_SYMBOLS ne olursa olsun (ALL/liste) signal-engine ona uyar.
  // (watchlist tablosu yalnızca log/uyumluluk için okunuyor.)
  if (watchlist.length > 0) {
    helper.log.info(`watchlist tablosunda ${watchlist.length} kayıt var (bilgi amaçlı; pattern-subscribe kullanılıyor)`);
  }

  await subRedis.psubscribe('md.*');
  helper.log.info('Signal engine pattern-subscribed: md.* (tüm coin\'ler)');

  subRedis.on('pmessage', async (_pattern, channel, raw) => {
    try {
      const msg = JSON.parse(raw);
      await handleMessage(channel, msg, { confluenceThreshold, onSignal });
    } catch (err) {
      helper.log.error('Subscriber message error:', err.message);
    }
  });
}

// Sadece buffer'ı güncelle, sinyal üretme (15m için)
function updateBufferOnly(symbol, tf, data) {
  const bufKey = `${symbol}.${tf}`;
  if (!candleBuffers[bufKey]) candleBuffers[bufKey] = [];
  candleBuffers[bufKey].push(data);
  if (candleBuffers[bufKey].length > CANDLE_BUFFER_SIZE) candleBuffers[bufKey].shift();
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

// 5m buffer'ından EMA trend yönünü döner; veri yoksa null
function getHigherTfTrend(symbol, tf = '5m') {
  const buf = candleBuffers[`${symbol}.${tf}`];
  if (!buf || buf.length < 30) return null;
  const closes = buf.map(c => c.close);
  // Basit EMA karşılaştırması — calcEMA import'u ağır; manuel hesap yeterli
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

async function handleMessage(channel, msg, { confluenceThreshold, onSignal }) {
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
  if (!candleBuffers[bufKey]) candleBuffers[bufKey] = [];

  candleBuffers[bufKey].push(data);
  if (candleBuffers[bufKey].length > CANDLE_BUFFER_SIZE) candleBuffers[bufKey].shift();

  const candles = candleBuffers[bufKey];
  if (candles.length < 50) return; // ADX güvenilir hesaplamak için yeterli mum

  const indicators = calcAllIndicators(candles);
  indicators.currentPrice = data.close;

  const state = ensureState(symbol);
  const prevClose = candles.length > 1 ? candles[candles.length - 2].close : data.close;
  const priceChange = prevClose > 0 ? (data.close - prevClose) / prevClose : 0;

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

  // Per-symbol lock: aynı anda iki TF'den sinyal üretilmesini önler (async race condition)
  if (signalLocks[symbol]) return;
  signalLocks[symbol] = true;

  try {
  // %1 minimum hedef filtresi + dinamik R/R — cooldown'dan ÖNCE
  // Takılan sinyal cooldown başlatmasın; volatilite artınca aynı coin tekrar denenebilsin
  const setup = buildSetup({
    direction: confluence.direction,
    currentPrice: data.close,
    atr: indicators.atr,
    supportLevel: indicators.supportLevel,
    resistanceLevel: indicators.resistanceLevel,
    minStopPct: MIN_STOP_PCT_BY_TF[tf] ?? 0.012,
  });
  if (!setup.meetsMinTarget) {
    helper.log.debug(`Min target not met: ${symbol} targetPct=${(setup.targetPct * 100).toFixed(3)}%`);
    return;
  }
  if (!setup.meetsMinRR) {
    helper.log.debug(`Min RR not met: ${symbol} rrRatio=${setup.rrRatio} (S/R capped)`);
    return;
  }
  if (!setup.meetsFeeFloor) {
    helper.log.debug(`Fee floor not met: ${symbol} stopPct=${(setup.stopPct * 100).toFixed(3)}% feeR=${setup.feeR} netRR=${(setup.rrRatio - setup.feeR).toFixed(2)}`);
    return;
  }

  // Cooldown: sembol bazlı — TF'e göre farklı süre (1m:10dk, 5m:30dk)
  const cooldownMs = COOLDOWN_BY_TF[tf] ?? SIGNAL_COOLDOWN_MS;
  const now = Date.now();
  if (lastSignalTs[symbol] && now - lastSignalTs[symbol] < cooldownMs) {
    helper.log.debug(`Cooldown active: ${symbol}`);
    return;
  }
  lastSignalTs[symbol] = now;

  const signal = await saveSignal({
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
  });
  await createOutcome(signal.id);

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

  helper.log.info(
    `✅ NEW SIGNAL: ${symbol} ${confluence.direction.toUpperCase()} | TF:${tf}` +
    ` | Score:${confluence.score.toFixed(3)} | Entry:${setup.entryPrice}` +
    ` | Stop:${setup.stopPrice} | Target:${setup.targetPrice} | RR:${setup.rrRatio}`
  );

  // Publish to signals.new for notifier service
  await datasources.coreRedis.publish(
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
