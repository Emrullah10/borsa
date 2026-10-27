// Bitget herkese açık REST uçları (anahtar gerekmez). Ek bağımlılık yok — global fetch.
// Tümü 2026-10-27'de canlı denendi: contracts, mix tickers, spot tickers/symbols,
// history-fund-rate, current-fund-rate, annoucements (Bitget'in kendi yazımı, "n" eksik).
const BASE = 'https://api.bitget.com';
const PRODUCT = 'USDT-FUTURES';
const ANN_LIMIT = 10;
const ANN_TYPES = ['product_updates', 'coin_listings', 'maintenance_system_updates'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeBitgetPublic({ fetchFn = fetch, retries = 2, pageDelayMs = 150 } = {}) {
  async function get(path, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = `${BASE}${path}${qs ? `?${qs}` : ''}`;
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetchFn(url);
        const json = await res.json();
        if (res.ok && json.code === '00000') return json.data;
        lastErr = new Error(`${path} → HTTP ${res.status} code=${json.code} ${json.msg ?? ''}`);
      } catch (err) {
        lastErr = err;
      }
      await sleep(500 * (attempt + 1));
    }
    throw lastErr;
  }

  // Map<symbol, { isRwa, symbolStatus }>
  async function fetchContracts() {
    const data = await get('/api/v2/mix/market/contracts', { productType: PRODUCT });
    return new Map(data.map((c) => [c.symbol, { isRwa: c.isRwa, symbolStatus: c.symbolStatus }]));
  }

  // Map<symbol, { bid, ask, mark, usdtVolume, fundingRate }>
  async function fetchPerpTickers() {
    const data = await get('/api/v2/mix/market/tickers', { productType: PRODUCT });
    return new Map(data.map((t) => [t.symbol, {
      bid: parseFloat(t.bidPr), ask: parseFloat(t.askPr), mark: parseFloat(t.markPrice),
      usdtVolume: parseFloat(t.usdtVolume), fundingRate: parseFloat(t.fundingRate), ts: Number(t.ts),
    }]));
  }

  // Yalnız ONLINE USDT spot çiftleri: Map<symbol, { bid, ask, usdtVolume }>
  async function fetchSpotTickers() {
    const [symbols, tickers] = await Promise.all([
      get('/api/v2/spot/public/symbols'),
      get('/api/v2/spot/market/tickers'),
    ]);
    const online = new Set(symbols.filter((s) => s.quoteCoin === 'USDT' && s.status === 'online').map((s) => s.symbol));
    const out = new Map();
    for (const t of tickers) {
      if (!online.has(t.symbol)) continue;
      out.set(t.symbol, { bid: parseFloat(t.bidPr), ask: parseFloat(t.askPr), usdtVolume: parseFloat(t.usdtVolume), ts: Number(t.ts) });
    }
    return out;
  }

  // Map<symbol, { rate, intervalHours, nextUpdate }>
  async function fetchCurrentFunding() {
    const data = await get('/api/v2/mix/market/current-fund-rate', { productType: PRODUCT });
    return new Map(data.map((f) => [f.symbol, {
      rate: parseFloat(f.fundingRate), intervalHours: Number(f.fundingRateInterval), nextUpdate: Number(f.nextUpdate),
    }]));
  }

  // sinceMs'den yeni gerçekleşmiş funding ödemeleri, artan sırada. Yeni sayfa ancak en eski kayıt
  // hâlâ sinceMs'den yeniyse istenir (1h aralıklı coin'de 14 gün = 336 kayıt = 4 sayfa).
  async function fetchFundingSince(symbol, sinceMs, { maxPages = 30 } = {}) {
    const byTs = new Map();
    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      const data = await get('/api/v2/mix/market/history-fund-rate', {
        symbol, productType: PRODUCT, pageSize: '100', pageNo: String(pageNo),
      });
      if (!data?.length) break;
      let added = 0;
      for (const f of data) {
        const ts = Number(f.fundingTime);
        if (ts > sinceMs && !byTs.has(ts)) { byTs.set(ts, parseFloat(f.fundingRate)); added++; }
      }
      const oldest = Math.min(...data.map((f) => Number(f.fundingTime)));
      if (oldest <= sinceMs || data.length < 100 || added === 0) break;
      await sleep(pageDelayMs);
    }
    return [...byTs.entries()].map(([timestamp, rate]) => ({ timestamp, rate })).sort((a, b) => a.timestamp - b.timestamp);
  }

  // Uç en fazla 10 kayıt veriyor (limit>10 → code 40017, ölçüldü). Bir patlamada delist duyurusu
  // genel akıştan taşmasın diye ilgili kategoriler ayrıca çekilip annId ile birleştirilir.
  async function fetchAnnouncements() {
    const byId = new Map();
    for (const annType of [null, ...ANN_TYPES]) {
      const params = { language: 'en_US', limit: String(ANN_LIMIT) };
      if (annType) params.annType = annType;
      for (const a of (await get('/api/v2/public/annoucements', params)) ?? []) byId.set(a.annId, a);
    }
    return [...byId.values()];
  }

  return { fetchContracts, fetchPerpTickers, fetchSpotTickers, fetchCurrentFunding, fetchFundingSince, fetchAnnouncements };
}
