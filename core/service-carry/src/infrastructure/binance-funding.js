// Binance USDT-M funding geçmişi (yıllarca geriye; Bitget yalnız ~90 gün saklar). Backtest'te Bitget'in
// vekili olarak kullanılır — aynı-an korelasyon ~0.58, tam ikame DEĞİL.
// Rate limit: fundingRate ucu IP başına 5 dakikada 500 istek → varsayılan 700ms aralık.
const BINANCE_FUNDING_URL = 'https://fapi.binance.com/fapi/v1/fundingRate';
const BINANCE_PAGE_LIMIT = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      console.warn(`[binance-funding] Binance ${symbol} funding alınamadı: ${err.message} (${out.length} kayıt elde)`);
      break;
    }
    if (!res.ok) {
      // 400/-1121 = Binance'te böyle bir sembol yok (Bitget'e özgü ya da 1000x kontrat) — beklenen durum.
      if (res.status !== 400) console.warn(`[binance-funding] Binance ${symbol} funding HTTP ${res.status} (${out.length} kayıt elde)`);
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

