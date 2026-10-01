import { RestClientV2 } from 'bitget-api';

const CANDLES_PER_REQUEST = 200;
const RATE_LIMIT_MS = 200;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function makeClient() {
  return new RestClientV2({}, {});
}

export async function fetchCandles(symbol, timeframe, days) {
  const client = makeClient();
  const now = Date.now();
  const startMs = now - days * 24 * 60 * 60 * 1000;

  const allCandles = [];
  let endTime = now;
  let attempts = 0;
  let lastOldest = Infinity;

  while (endTime > startMs) {
    if (attempts > 0) await sleep(RATE_LIMIT_MS);
    attempts++;

    let res;
    try {
      res = await client.getFuturesHistoricCandles({
        symbol,
        granularity: timeframe,
        endTime: String(endTime),
        limit: String(CANDLES_PER_REQUEST),
        productType: 'USDT-FUTURES',
      });
    } catch (err) {
      let retries = 3;
      while (retries-- > 0) {
        await sleep(500);
        try {
          res = await client.getFuturesHistoricCandles({
            symbol,
            granularity: timeframe,
            endTime: String(endTime),
            limit: String(CANDLES_PER_REQUEST),
            productType: 'USDT-FUTURES',
          });
          break;
        } catch (_) {}
      }
      if (!res) { console.warn(`[fetcher] ${symbol} veri alınamadı, atlanıyor`); break; }
    }

    const data = res?.data ?? [];
    if (!data.length) break;

    const parsed = data.map(c => ({
      timestamp: Number(c[0]),
      open:   parseFloat(c[1]),
      high:   parseFloat(c[2]),
      low:    parseFloat(c[3]),
      close:  parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));

    allCandles.push(...parsed);

    const oldest = Math.min(...data.map(c => Number(c[0])));
    if (oldest <= startMs) break;
    // API endTime'ı yok sayıp aynı sayfayı dönerse ilerleme yok → sonsuz döngüye girme.
    if (oldest >= lastOldest) break;
    lastOldest = oldest;
    // 2026-09-30 düzeltmesi: eskiden `oldest - 1`. Bitget endTime'ı "mumun KAPANIŞ zamanı <= endTime"
    // diye yorumluyor: endTime=oldest-1 olunca oldest'tan bir önceki mum (kapanışı tam `oldest`)
    // dışarıda kalıyordu → HER sayfa sınırında tam 1 mum kaybı (1d'de 90'da 1, 1h/5m'de 200'de 1;
    // tüm zaman dilimleri, tüm backtest verisi). endTime=oldest o mumu dahil eder, `oldest`'ın
    // kendisini (kapanışı oldest+period > endTime) dışarıda bırakır → kopya da yok.
    endTime = oldest;
  }

  const unique = [...new Map(allCandles.map(c => [c.timestamp, c])).values()];
  return unique.sort((a, b) => a.timestamp - b.timestamp);
}

// Lab (2026-09-30): eskiden tek istek (pageSize=100) atıp sadece son ~33 günü
// (100 kayıt × 8s) alıyordu. Şimdi sayfalar. Bitget geçmişi yalnız ~90 gün saklıyor
// (2026-09-30 ölçümü: BTC/SOL 270 kayıt, WIF 540) — daha eskisi için Binance kullanılır.
const FUNDING_PAGE_SIZE = 100;
const FUNDING_MAX_PAGES = 60;

export async function fetchFundingHistory(symbol) {
  const client = makeClient();
  const byTs = new Map();

  for (let pageNo = 1; pageNo <= FUNDING_MAX_PAGES; pageNo++) {
    let res;
    try {
      res = await client.getFuturesHistoricFundingRates({
        symbol,
        productType: 'USDT-FUTURES',
        pageSize: String(FUNDING_PAGE_SIZE),
        pageNo: String(pageNo),
      });
    } catch (err) {
      // Kısmi veriyi kaybetme, ama sessiz de geçme: hangi sayfada koptuğu görünsün.
      console.warn(`[fetcher] ${symbol} funding history sayfa ${pageNo}'de alınamadı: ${err.message} (${byTs.size} kayıt elde)`);
      break;
    }

    const data = res?.data ?? [];
    if (!data.length) break;

    let added = 0;
    for (const f of data) {
      const timestamp = Number(f.fundingTime);
      if (!byTs.has(timestamp)) { byTs.set(timestamp, parseFloat(f.fundingRate)); added++; }
    }
    // API pageNo'yu yok sayıp aynı sayfayı dönerse sonsuz döngüye girme.
    if (added === 0) break;
    if (data.length < FUNDING_PAGE_SIZE) break;
    if (pageNo > 1) await sleep(RATE_LIMIT_MS);
  }

  return [...byTs.entries()]
    .map(([timestamp, rate]) => ({ timestamp, rate }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

// Binance USDT-M funding geçmişi (yıllarca geriye). Bitget ile aynı-an korelasyonu
// ~0.58 (SOL, 2026-09-30) — tam ikame DEĞİL, sinyal vekili olarak kullanılır.
// Rate limit: fundingRate ucu IP başına 5 dakikada 500 istek → varsayılan 700ms aralık.
const BINANCE_FUNDING_URL = 'https://fapi.binance.com/fapi/v1/fundingRate';
const BINANCE_PAGE_LIMIT = 1000;

export async function fetchBinanceFundingHistory(symbol, {
  fromMs, toMs = Date.now(), fetchImpl = fetch, sleepMs = 700,
} = {}) {
  const out = [];
  let startTime = fromMs;

  for (let guard = 0; guard < 100; guard++) {
    const url = `${BINANCE_FUNDING_URL}?symbol=${symbol}&startTime=${startTime}&endTime=${toMs}&limit=${BINANCE_PAGE_LIMIT}`;
    let res;
    try {
      res = await fetchImpl(url);
    } catch (err) {
      console.warn(`[fetcher] Binance ${symbol} funding alınamadı: ${err.message} (${out.length} kayıt elde)`);
      break;
    }
    if (!res.ok) {
      // 400/-1121 = Binance'te böyle bir sembol yok (Bitget'e özgü ya da 1000x kontrat) — beklenen durum.
      if (res.status !== 400) console.warn(`[fetcher] Binance ${symbol} funding HTTP ${res.status} (${out.length} kayıt elde)`);
      break;
    }

    const data = await res.json();
    if (!Array.isArray(data) || !data.length) break;

    for (const f of data) {
      const timestamp = Number(f.fundingTime);
      if (timestamp <= toMs) out.push({ timestamp, rate: parseFloat(f.fundingRate) });
    }

    const last = Number(data[data.length - 1].fundingTime);
    if (data.length < BINANCE_PAGE_LIMIT || last >= toMs) break;
    startTime = last + 1;
    if (sleepMs > 0) await sleep(sleepMs);
  }

  return out.sort((a, b) => a.timestamp - b.timestamp);
}

// Binance PEPE/BONK/SHIB gibi düşük fiyatlı coinler için 1000x çarpanlı kontrat listeler
// (ör. 1000PEPEUSDT). Funding bir ORAN olduğundan çarpan sonucu değiştirmez.
export function binanceSymbolCandidates(symbol) {
  const base = symbol.replace(/USDT$/, '');
  return [symbol, `1000${base}USDT`];
}

export async function fetchOISnapshot(symbol) {
  const client = makeClient();
  try {
    const res = await client.getFuturesOpenInterest({
      symbol,
      productType: 'USDT-FUTURES',
    });
    const list = res?.data?.openInterestList ?? [];
    return list.length ? parseFloat(list[0].size) : 0;
  } catch (err) {
    console.warn(`[fetcher] OI alınamadı: ${err.message}`);
    return 0;
  }
}

export function interpolateFunding(timestamp, fundingHistory) {
  if (!fundingHistory.length) return 0.0001;
  let closest = fundingHistory[0];
  for (const f of fundingHistory) {
    if (Math.abs(f.timestamp - timestamp) < Math.abs(closest.timestamp - timestamp)) {
      closest = f;
    }
  }
  return closest.rate;
}

// Lab (2026-09-30): "işlem yapılabilir evren" = 24s USDT hacmi eşiğin üstündeki, normal
// durumdaki KRİPTO perp'ler. Bitget'in 804 kontratının 339'u RWA (hisse/ETF/emtia, isRwa=YES:
// KORUUSDT bir ETF, SNDK/MSTR hisse, XAU altın) — 7/24 kripto gibi davranmazlar, kripto
// stratejisi evrenine (ve eski sweep'in "midcap" listesine) girmemeliydi.
// Hata → fırlatır: sessizce boş evrenle devam etmek backfill'i "başarılı" gösterirdi.
async function fetchContractInfo() {
  const res = await makeClient().getFuturesContractConfig({ productType: 'USDT-FUTURES' });
  return new Map((res?.data ?? []).map((c) => [c.symbol, c]));
}

const isTradableCrypto = (c) => c != null && c.symbolStatus === 'normal' && c.isRwa !== 'YES';

export async function fetchCryptoSymbolSet() {
  const info = await fetchContractInfo();
  return new Set([...info.values()].filter(isTradableCrypto).map((c) => c.symbol));
}

export async function fetchLiquidUniverse({ minVolumeUsdt, excludeRwa = true }) {
  const client = makeClient();
  const [tickers, info] = await Promise.all([
    client.getFuturesAllTickers({ productType: 'USDT-FUTURES' }),
    fetchContractInfo(),
  ]);
  return (tickers?.data ?? [])
    .map((t) => ({ symbol: t.symbol, vol: parseFloat(t.usdtVolume ?? 0) }))
    .filter((t) => t.symbol && t.vol >= minVolumeUsdt)
    .filter((t) => {
      const c = info.get(t.symbol);
      if (c == null || c.symbolStatus !== 'normal') return false; // bilinmeyen/normal değil → temkinli ele
      return !excludeRwa || c.isRwa !== 'YES';
    })
    .sort((a, b) => b.vol - a.vol)
    .map((t) => t.symbol);
}
