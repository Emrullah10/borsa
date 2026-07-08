import helper from '@borsa-bot/helper';

const DEFAULT_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'SUIUSDT',
];

const TIMEFRAMES = ['1m', '5m', '15m', '4H'];

// Bitget public WS hız/topic limiti nedeniyle (code 30006 "request too many")
// tüm 595 coin tek bağlantıda izlenemez. TOP_N en likit coin'lerle sınırlar.
const DEFAULT_TOP_N = 50;

// Coin listesini belirle:
// - MARKET_DATA_SYMBOLS=TOP[:N] → hacme göre en likit N coin (varsayılan N=50)
// - MARKET_DATA_SYMBOLS=a,b,c    → o liste
// - boş                          → DEFAULT_SYMBOLS
async function resolveSymbols() {
  const env = process.env.MARKET_DATA_SYMBOLS?.trim();
  const upper = env?.toUpperCase();

  // TOP veya TOP:100 gibi
  if (upper && (upper === 'TOP' || upper.startsWith('TOP:') || upper === 'ALL')) {
    const n =
      upper.startsWith('TOP:') ? Math.max(1, parseInt(upper.slice(4), 10) || DEFAULT_TOP_N)
      : upper === 'ALL' ? Infinity
      : DEFAULT_TOP_N;
    try {
      const { RestClientV2 } = await import('bitget-api');
      const rest = new RestClientV2({}, {});
      const res = await rest.getFuturesAllTickers({ productType: 'USDT-FUTURES' });
      const ranked = (res?.data ?? [])
        .map((t) => ({ symbol: t.symbol, vol: parseFloat(t.usdtVolume ?? 0) }))
        .filter((t) => t.symbol)
        .sort((a, b) => b.vol - a.vol)
        .slice(0, n === Infinity ? undefined : n)
        .map((t) => t.symbol);
      if (ranked.length > 0) {
        helper.log.info(`MARKET_DATA_SYMBOLS=${env} → hacme göre ${ranked.length} coin yüklendi`);
        return ranked;
      }
      helper.log.warn('Bitget ticker listesi boş döndü, DEFAULT_SYMBOLS kullanılıyor');
    } catch (e) {
      helper.log.error('Ticker listesi çekilemedi, DEFAULT_SYMBOLS:', e.message);
    }
    return DEFAULT_SYMBOLS;
  }

  if (env) {
    return env.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  }

  return DEFAULT_SYMBOLS;
}

// 4h buffer dolması ~8 gün sürer — başlangıçta REST'ten geçmiş mumlarla doldur
// Rejim sadece BTC'ye baktığı için yalnızca BTCUSDT 4h ön-doldurulur
async function prefill4hCandles(publisher) {
  try {
    const { RestClientV2 } = await import('bitget-api');
    const rest = new RestClientV2({}, {});
    const res = await rest.getFuturesHistoricCandles({
      symbol: 'BTCUSDT',
      granularity: '4H',
      limit: '60',
      productType: 'USDT-FUTURES',
    });
    const rows = res?.data ?? [];
    // Bitget en yeni→eski döndürür; eski→yeni sıraya çevir (buffer FIFO için)
    const sorted = [...rows].sort((a, b) => Number(a[0]) - Number(b[0]));
    for (const d of sorted) {
      await publisher.publishCandle('BTCUSDT', '4h', {
        ts:     Number(d[0]),
        open:   parseFloat(d[1]),
        high:   parseFloat(d[2]),
        low:    parseFloat(d[3]),
        close:  parseFloat(d[4]),
        volume: parseFloat(d[5]),
      });
    }
    helper.log.info(`4h ön-doldurma: BTCUSDT için ${sorted.length} mum yüklendi`);
  } catch (err) {
    helper.log.warn('4h ön-doldurma başarısız:', err.message);
  }
}

// LSR (Long/Short Ratio) WS'te gelmiyor — REST'ten periyodik çek
const LSR_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 dakika

async function startLsrPoller(symbols, publisher) {
  const pollLsr = async () => {
    try {
      const { RestClientV2 } = await import('bitget-api');
      const rest = new RestClientV2({}, {});
      for (const symbol of symbols) {
        try {
          const res = await rest.getFuturesAccountLongShortRatio({
            productType: 'USDT-FUTURES',
            symbol,
            period: '5min',
            limit: '1',
          });
          const d = res?.data?.[0];
          if (d?.longRatio != null) {
            await publisher.publishLongShortRatio(symbol, {
              longRatio:  parseFloat(d.longRatio),
              shortRatio: parseFloat(d.shortRatio ?? (1 - parseFloat(d.longRatio))),
            });
          }
        } catch {
          // Sembol başına hata → sessizce geç
        }
      }
    } catch (err) {
      helper.log.warn('LSR poll error:', err.message);
    }
  };

  await pollLsr(); // İlk çalıştırma
  setInterval(pollLsr, LSR_POLL_INTERVAL_MS);
  helper.log.info(`LSR poller başlatıldı — ${symbols.length} sembol, ${LSR_POLL_INTERVAL_MS / 60000}dk aralık`);
}

export async function startBitgetWS({ publisher }) {
  const symbols = await resolveSymbols();

  const bitgetApi = await import('bitget-api');

  // v2.x uses WebsocketClientV2; fall back to WebsocketClient for older installs
  const WsClientClass =
    bitgetApi.WebsocketClientV2 ??
    bitgetApi.WebsocketClient ??
    bitgetApi.default?.WebsocketClientV2;

  if (!WsClientClass) {
    helper.log.error(
      'Could not find WebSocket client in bitget-api. Available exports:',
      Object.keys(bitgetApi),
    );
    throw new Error('bitget-api WebSocket client not found');
  }

  const ws = new WsClientClass({});

  ws.on('update', async (data) => {
    try {
      await handleUpdate(data, publisher);
    } catch (err) {
      helper.log.error('WS update error:', err.message);
    }
  });

  ws.on('error', (err) => helper.log.error('Bitget WS error:', JSON.stringify(err, Object.getOwnPropertyNames(err))));

  // SDK emits 'response' for subscribe ACK/errors — log rejected subscriptions
  ws.on('response', (msg) => {
    if (msg?.event === 'error' || msg?.code) {
      helper.log.error('Bitget WS subscribe rejected:', JSON.stringify(msg));
    }
  });

  // Tek bir abonelik turu çalışsın; reconnect/open/ilk-çağrı üçü de bunu tetikler
  // ama guard mükerrer turları engeller.
  ws.on('reconnected', () => {
    helper.log.info('Bitget WS reconnected, resubscribing...');
    subscribeAll(ws, symbols);
  });

  ws.on('open', () => {
    helper.log.info('Bitget WS connected');
    subscribeAll(ws, symbols);
  });

  subscribeAll(ws, symbols);

  // LSR REST poller'ı arka planda başlat
  startLsrPoller(symbols, publisher).catch(err =>
    helper.log.error('LSR poller başlatılamadı:', err.message)
  );

  // 4h buffer'ı REST geçmiş mumlarla ön-doldur (rejim anında çalışsın)
  prefill4hCandles(publisher).catch(err =>
    helper.log.error('4h ön-doldurma başlatılamadı:', err.message)
  );
}

// Bitget public WS ~10 istek/sn kabul eder (code 30006 aşımda). Güvenli kal: 8/sn.
const SUB_BATCH = 8;         // her turda kaç topic gönderilsin
const SUB_DELAY_MS = 1000;   // gruplar arası bekleme (~8 istek/sn)

let subscribing = false;
async function subscribeAll(ws, symbols) {
  // Aynı anda iki abonelik turu çalışmasın (open + reconnected aynı anda gelebilir)
  if (subscribing) return;
  subscribing = true;

  // Tüm topic'leri düz listeye aç: her coin için candle{tf}'ler + ticker
  const topics = [];
  for (const symbol of symbols) {
    for (const tf of TIMEFRAMES) {
      topics.push({ channel: `candle${tf}`, instId: symbol });
    }
    // Bitget V2 public WS: funding-rate/open-interest ayrı kanal YOK (code 30016).
    // 'ticker' kanalı fundingRate, nextFundingTime ve holdingAmount (OI) taşır.
    topics.push({ channel: 'ticker', instId: symbol });
  }

  helper.log.info(
    `Abone olunuyor: ${symbols.length} coin → ${topics.length} topic, ` +
      `${SUB_BATCH}'lik gruplar, ${SUB_DELAY_MS}ms arayla`,
  );

  try {
    for (let i = 0; i < topics.length; i += SUB_BATCH) {
      const batch = topics.slice(i, i + SUB_BATCH);
      for (const t of batch) {
        try {
          ws.subscribeTopic('USDT-FUTURES', t.channel, t.instId);
        } catch (e) {
          helper.log.warn(`Subscribe ${t.channel} ${t.instId} failed:`, e.message);
        }
      }
      if (i + SUB_BATCH < topics.length) {
        await new Promise((r) => setTimeout(r, SUB_DELAY_MS));
      }
    }
    helper.log.info('Tüm abonelikler gönderildi');
  } finally {
    subscribing = false;
  }
}

async function handleUpdate(event, publisher) {
  const { arg, data } = event;
  if (!arg || !data) return;

  const { channel, instId: symbol } = arg;
  if (!symbol) return;

  if (channel.startsWith('candle')) {
    // Bitget kanalı 'candle4H' → tf'i küçük harfe normalize et ('4h')
    const tf = channel.replace('candle', '').toLowerCase();
    for (const d of (Array.isArray(data) ? data : [data])) {
      const candle = {
        ts:     Number(d[0]),
        open:   parseFloat(d[1]),
        high:   parseFloat(d[2]),
        low:    parseFloat(d[3]),
        close:  parseFloat(d[4]),
        volume: parseFloat(d[5]),
      };
      await publisher.publishCandle(symbol, tf, candle);
    }
    return;
  }

  // ticker carries funding rate, next funding time and open interest (holdingAmount)
  if (channel === 'ticker') {
    for (const d of (Array.isArray(data) ? data : [data])) {
      if (d.fundingRate != null) {
        await publisher.publishFunding(symbol, {
          rate:   parseFloat(d.fundingRate),
          nextTs: Number(d.nextFundingTime ?? 0),
        });
      }
      if (d.holdingAmount != null) {
        await publisher.publishOI(symbol, {
          oi: parseFloat(d.holdingAmount),
        });
      }
    }
    return;
  }
}
