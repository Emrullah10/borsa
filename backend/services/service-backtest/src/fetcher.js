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
    endTime = oldest - 1;
  }

  const unique = [...new Map(allCandles.map(c => [c.timestamp, c])).values()];
  return unique.sort((a, b) => a.timestamp - b.timestamp);
}

export async function fetchFundingHistory(symbol) {
  const client = makeClient();
  let res;
  try {
    res = await client.getFuturesHistoricFundingRates({
      symbol,
      productType: 'USDT-FUTURES',
      pageSize: '100',
    });
  } catch (err) {
    console.warn(`[fetcher] funding history alınamadı: ${err.message}`);
    return [];
  }

  return (res?.data ?? []).map(f => ({
    timestamp: Number(f.fundingTime),
    rate: parseFloat(f.fundingRate),
  })).sort((a, b) => a.timestamp - b.timestamp);
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
