# Analiz Asistanı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut frontend'i komple yeniden yaz — sol sinyal listesi + sağda grafik+AI analiz paneli, canlı backend bağlantısıyla.

**Architecture:** Backend'e 3 yeni endpoint eklenir (signal-engine: GET /signals + WS /ws; market-data: GET /candles/:symbol + GET /price/:symbol). Frontend tamamen yeniden yazılır: Zustand store sinyalleri ve fiyatları tutar, WS üzerinden canlı güncellenir, seçili sinyal sağ panelde ECharts grafiği + AI yorum + metriklerle gösterilir.

**Tech Stack:** Node ESM + Express + ws (backend); Vite + React 18 + MUI v5 + ECharts + Zustand (frontend); Vitest + @testing-library/react (test).

**Repo notu:** Git yok — commit adımlarını atla. Her task sonunda `.wolf/memory.md` son tablosuna satır ekle.

**Servis portları:** signal-engine=3102, market-data=3101.

**Env vars (frontend):**
- `VITE_SIGNAL_URL=http://localhost:3102`
- `VITE_MARKET_URL=http://localhost:3101`

---

## File Structure

### Backend — signal-engine
- Create: `backend/services/service-signal-engine/src/candle-store.js` — Redis'te son 60 mumu tutan ring buffer (market-data'dan sub)
- Modify: `backend/services/service-signal-engine/src/signal-repository.js` — `getRecentSignals(limit)` fonksiyonu ekle
- Create: `backend/services/service-signal-engine/src/ws-server.js` — WebSocket sunucusu, sinyal push
- Modify: `backend/services/service-signal-engine/main.js` — GET /signals + WS /ws ekle
- Test: `backend/services/service-signal-engine/test/unit/signal-repository.test.js` — getRecentSignals mock test
- Test: `backend/services/service-signal-engine/test/unit/ws-server.test.js` — WS broadcast test

### Backend — market-data
- Create: `backend/services/service-market-data/src/candle-store.js` — Redis'e son 60 mumu yaz (her publish'te)
- Modify: `backend/services/service-market-data/src/publisher.js` — publishCandle içinde candle-store'a da yaz
- Modify: `backend/services/service-market-data/main.js` — GET /candles/:symbol + GET /price/:symbol ekle
- Test: `backend/services/service-market-data/test/unit/candle-store.test.js`

### Frontend (komple yeniden yazım)
- Delete content: `frontend/src/components/` — tüm eski bileşenler silinir, yenileri yazılır
- Keep: `frontend/src/theme.js`, `frontend/src/data/mockData.js` (fallback), `frontend/src/store/useStore.js` (genişletilir)
- Create: `frontend/src/api/signalApi.js` — GET /signals + WS bağlantısı
- Create: `frontend/src/api/marketApi.js` — GET /candles/:symbol, GET /price/:symbol
- Create: `frontend/src/api/serviceApi.js` — health ping
- Modify: `frontend/src/store/useStore.js` — signals[], selectedSignal, prices{} ekle
- Create: `frontend/src/utils/aiComment.js` — mock AI yorum üretici (saf fonksiyon)
- Create: `frontend/src/components/TopBar.jsx` — canlı fiyat + servis durumu
- Create: `frontend/src/components/SignalList.jsx` — WS'ten güncellenen sol panel
- Create: `frontend/src/components/SignalChart.jsx` — ECharts candlestick + overlay
- Create: `frontend/src/components/AiComment.jsx` — AI yorum kutusu
- Create: `frontend/src/components/MetricRow.jsx` — giriş/stop/hedef/rr
- Create: `frontend/src/components/DetailPanel.jsx` — sağ panel container
- Modify: `frontend/src/App.jsx` — yeni 2 sütun layout
- Modify: `frontend/src/main.jsx` — ThemeProvider (değişmez, sadece doğrula)
- Create: `frontend/.env` — VITE_SIGNAL_URL, VITE_MARKET_URL

---

## Task 1: signal-repository'e getRecentSignals ekle

**Files:**
- Modify: `backend/services/service-signal-engine/src/signal-repository.js`
- Test: `backend/services/service-signal-engine/test/unit/signal-repository.test.js`

- [ ] **Step 1: Mevcut test dosyasını kontrol et**

```bash
ls backend/services/service-signal-engine/test/unit/
```

Eğer `signal-repository.test.js` yoksa oluştur (varsa aşağıdaki testi ekle).

- [ ] **Step 2: Failing test yaz**

`backend/services/service-signal-engine/test/unit/signal-repository.test.js` dosyasına ekle (dosya yoksa oluştur):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// datasources mock — postgres.query'yi kontrol ediyoruz
vi.mock('@borsa-bot/datasource', () => ({
  default: {
    postgres: {
      query: vi.fn(),
    },
  },
}));

import datasources from '@borsa-bot/datasource';
import { getRecentSignals } from '../../src/signal-repository.js';

describe('getRecentSignals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('doğru SQL ile limit=20 çağırır ve rows döner', async () => {
    const fakeRows = [
      { id: 1, symbol: 'BTCUSDT', direction: 'long', entry_price: '78000', confluence_score: '0.87', created_at: new Date() },
    ];
    datasources.postgres.query.mockResolvedValue({ rows: fakeRows });

    const result = await getRecentSignals(20);

    expect(datasources.postgres.query).toHaveBeenCalledOnce();
    const [sql, params] = datasources.postgres.query.mock.calls[0];
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(params).toEqual([20]);
    expect(result).toEqual(fakeRows);
  });
});
```

- [ ] **Step 3: Test'in fail ettiğini doğrula**

```bash
cd backend && npx vitest run services/service-signal-engine/test/unit/signal-repository.test.js
```

Expected: FAIL — `getRecentSignals is not a function`

- [ ] **Step 4: getRecentSignals fonksiyonunu ekle**

`backend/services/service-signal-engine/src/signal-repository.js` dosyasının sonuna ekle:

```js
export async function getRecentSignals(limit = 20) {
  const { postgres } = datasources;
  const sql = `
    SELECT id, symbol, direction, entry_price, stop_price, target_price,
           rr_ratio, confluence_score, indicators_snapshot, created_at
    FROM signals
    ORDER BY created_at DESC
    LIMIT $1
  `;
  const result = await postgres.query(sql, [limit]);
  return result.rows;
}
```

- [ ] **Step 5: Test geçtiğini doğrula**

```bash
cd backend && npx vitest run services/service-signal-engine/test/unit/signal-repository.test.js
```

Expected: PASS (1 test)

---

## Task 2: market-data — candle store ve REST endpoint'ler

**Files:**
- Create: `backend/services/service-market-data/src/candle-store.js`
- Modify: `backend/services/service-market-data/src/publisher.js`
- Modify: `backend/services/service-market-data/main.js`
- Test: `backend/services/service-market-data/test/unit/candle-store.test.js`

**Mantık:** market-data zaten Redis'e `md.BTCUSDT.1m` channel'ına candle publish ediyor ama saklamıyor. candle-store Redis List kullanır: her sembol+timeframe için `candles:BTCUSDT:1m` key'inde son 60 mumu tutar (LPUSH + LTRIM).

- [ ] **Step 1: Failing test yaz**

`backend/services/service-market-data/test/unit/candle-store.test.js` oluştur:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@borsa-bot/datasource', () => ({
  default: {
    coreRedis: {
      lpush: vi.fn().mockResolvedValue(1),
      ltrim: vi.fn().mockResolvedValue('OK'),
      lrange: vi.fn(),
    },
  },
}));

import datasources from '@borsa-bot/datasource';
import { pushCandle, getCandles } from '../../src/candle-store.js';

describe('candle-store', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pushCandle: lpush + ltrim çağırır', async () => {
    const candle = { ts: 1000, open: 100, high: 105, low: 99, close: 103, volume: 50 };
    await pushCandle('BTCUSDT', '1m', candle);
    expect(datasources.coreRedis.lpush).toHaveBeenCalledWith(
      'candles:BTCUSDT:1m',
      JSON.stringify(candle),
    );
    expect(datasources.coreRedis.ltrim).toHaveBeenCalledWith('candles:BTCUSDT:1m', 0, 59);
  });

  it('getCandles: lrange çağırır ve parse eder', async () => {
    const candle = { ts: 1000, open: 100, high: 105, low: 99, close: 103, volume: 50 };
    datasources.coreRedis.lrange.mockResolvedValue([JSON.stringify(candle)]);
    const result = await getCandles('BTCUSDT', '1m', 60);
    expect(datasources.coreRedis.lrange).toHaveBeenCalledWith('candles:BTCUSDT:1m', 0, 59);
    expect(result).toEqual([candle]);
  });
});
```

- [ ] **Step 2: Test'in fail ettiğini doğrula**

```bash
cd backend && npx vitest run services/service-market-data/test/unit/candle-store.test.js
```

Expected: FAIL — `candle-store.js` yok

- [ ] **Step 3: candle-store.js yaz**

`backend/services/service-market-data/src/candle-store.js` oluştur:

```js
import datasources from '@borsa-bot/datasource';

const MAX_CANDLES = 60;

export async function pushCandle(symbol, tf, candle) {
  const key = `candles:${symbol}:${tf}`;
  await datasources.coreRedis.lpush(key, JSON.stringify(candle));
  await datasources.coreRedis.ltrim(key, 0, MAX_CANDLES - 1);
}

export async function getCandles(symbol, tf, limit = MAX_CANDLES) {
  const key = `candles:${symbol}:${tf}`;
  const raw = await datasources.coreRedis.lrange(key, 0, limit - 1);
  return raw.map((s) => JSON.parse(s)).reverse(); // eskiden yeniye
}

export async function getLastPrice(symbol) {
  const raw = await datasources.coreRedis.lrange(`candles:${symbol}:1m`, 0, 0);
  if (!raw.length) return null;
  return JSON.parse(raw[0]).close;
}
```

- [ ] **Step 4: Test geçtiğini doğrula**

```bash
cd backend && npx vitest run services/service-market-data/test/unit/candle-store.test.js
```

Expected: PASS (2 test)

- [ ] **Step 5: publisher.js'e pushCandle entegre et**

`backend/services/service-market-data/src/publisher.js` dosyasını değiştir — başına import ekle ve `publishCandle` içine `pushCandle` çağrısı ekle:

```js
import datasources from '@borsa-bot/datasource';
import { pushCandle } from './candle-store.js';

export function createPublisher(redisOverride) {
  const redis = redisOverride ?? datasources.coreRedis;

  async function publishCandle(symbol, tf, candle) {
    const channel = `md.${symbol}.${tf}`;
    const payload = JSON.stringify({ type: 'candle', symbol, tf, data: candle });
    await redis.publish(channel, payload);
    await pushCandle(symbol, tf, candle);
  }

  async function publishFunding(symbol, funding) {
    const channel = `md.${symbol}.funding`;
    const payload = JSON.stringify({ type: 'funding', symbol, data: funding });
    await redis.publish(channel, payload);
  }

  async function publishOI(symbol, oi) {
    const channel = `md.${symbol}.oi`;
    const payload = JSON.stringify({ type: 'oi', symbol, data: oi });
    await redis.publish(channel, payload);
  }

  async function publishLongShortRatio(symbol, ratio) {
    const channel = `md.${symbol}.lsr`;
    const payload = JSON.stringify({ type: 'lsr', symbol, data: ratio });
    await redis.publish(channel, payload);
  }

  return { publishCandle, publishFunding, publishOI, publishLongShortRatio };
}
```

- [ ] **Step 6: market-data main.js'e REST endpoint'ler ekle**

`backend/services/service-market-data/main.js` dosyasını değiştir:

```js
import express from 'express';
import loadConfig from '@borsa-bot/config';
import { createDatasources } from '@borsa-bot/datasource';
import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { createServiceDiscovery } from '@borsa-bot/service-discovery';
import appConfigSchema from './configs/app-config.js';
import { startBitgetWS } from './src/bitget-ws.js';
import { getCandles, getLastPrice } from './src/candle-store.js';

async function initialize() {
  const config = loadConfig(appConfigSchema);
  const app = express();

  await createDatasources(config).catch((err) => {
    helper.exitOnError(err);
  });

  const sd = createServiceDiscovery(
    datasources.discoveryRedis,
    'service-market-data',
    { port: config.port, version: '1.0.0' },
  );
  await sd.register();
  sd.startHeartbeat();

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'service-market-data' }));

  app.get('/candles/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      const tf = req.query.timeframe ?? '1m';
      const limit = Math.min(parseInt(req.query.limit ?? '60', 10), 200);
      const candles = await getCandles(symbol, tf, limit);
      res.json({ symbol, tf, candles });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/price/:symbol', async (req, res) => {
    try {
      const price = await getLastPrice(req.params.symbol);
      res.json({ symbol: req.params.symbol, price });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(config.port, () => helper.appStarted(config));

  await startBitgetWS();
}

initialize().catch(helper.exitOnError);
```

- [ ] **Step 7: Mevcut publisher testlerinin hâlâ geçtiğini doğrula**

```bash
cd backend && npx vitest run services/service-market-data/test/unit/
```

Expected: PASS (tüm mevcut testler + yeni 2 test)

---

## Task 3: signal-engine — GET /signals + WebSocket /ws

**Files:**
- Create: `backend/services/service-signal-engine/src/ws-server.js`
- Modify: `backend/services/service-signal-engine/main.js`
- Test: `backend/services/service-signal-engine/test/unit/ws-server.test.js`

**Bağımlılık:** `ws` paketi signal-engine'in package.json'ında yoksa ekle.

- [ ] **Step 1: ws paketini kontrol et ve gerekirse ekle**

```bash
cat backend/services/service-signal-engine/package.json | grep '"ws"'
```

Yoksa:

```bash
cd backend/services/service-signal-engine && npm install ws
```

- [ ] **Step 2: ws-server.js için failing test yaz**

`backend/services/service-signal-engine/test/unit/ws-server.test.js` oluştur:

```js
import { describe, it, expect, vi } from 'vitest';
import { createWsServer } from '../../src/ws-server.js';

describe('createWsServer', () => {
  it('broadcast: tüm açık client\'lara mesaj gönderir', () => {
    const { broadcast, addClient } = createWsServer();
    const sent = [];
    const fakeClient = { readyState: 1, send: (msg) => sent.push(msg) }; // 1 = OPEN
    const closedClient = { readyState: 3, send: vi.fn() }; // 3 = CLOSED

    addClient(fakeClient);
    addClient(closedClient);
    broadcast({ type: 'signal', data: { id: 1 } });

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0])).toEqual({ type: 'signal', data: { id: 1 } });
    expect(closedClient.send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Test'in fail ettiğini doğrula**

```bash
cd backend && npx vitest run services/service-signal-engine/test/unit/ws-server.test.js
```

Expected: FAIL — `ws-server.js` yok

- [ ] **Step 4: ws-server.js yaz**

`backend/services/service-signal-engine/src/ws-server.js` oluştur:

```js
import { WebSocketServer } from 'ws';

export function createWsServer() {
  const clients = new Set();

  function addClient(ws) {
    clients.add(ws);
    ws.on?.('close', () => clients.delete(ws));
  }

  function broadcast(payload) {
    const msg = JSON.stringify(payload);
    for (const client of clients) {
      if (client.readyState === 1) client.send(msg);
    }
  }

  function attach(httpServer) {
    const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    wss.on('connection', (ws) => {
      addClient(ws);
      const ping = setInterval(() => {
        if (ws.readyState === 1) ws.ping();
      }, 30_000);
      ws.on('close', () => clearInterval(ping));
    });
    return wss;
  }

  return { addClient, broadcast, attach };
}
```

- [ ] **Step 5: Test geçtiğini doğrula**

```bash
cd backend && npx vitest run services/service-signal-engine/test/unit/ws-server.test.js
```

Expected: PASS (1 test)

- [ ] **Step 6: signal-engine main.js'i güncelle**

`backend/services/service-signal-engine/main.js` dosyasını değiştir:

```js
import http from 'http';
import express from 'express';
import loadConfig from '@borsa-bot/config';
import { createDatasources } from '@borsa-bot/datasource';
import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { createServiceDiscovery } from '@borsa-bot/service-discovery';
import appConfigSchema from './configs/app-config.js';
import { startSubscriber } from './src/subscriber.js';
import { getRecentSignals } from './src/signal-repository.js';
import { createWsServer } from './src/ws-server.js';

async function initialize() {
  const config = loadConfig(appConfigSchema);
  const app = express();
  const httpServer = http.createServer(app);

  await createDatasources(config).catch(helper.exitOnError);

  const sd = createServiceDiscovery(
    datasources.discoveryRedis,
    'service-signal-engine',
    { port: config.port, version: '1.0.0' },
  );
  await sd.register();
  sd.startHeartbeat();

  const wsServer = createWsServer();
  wsServer.attach(httpServer);

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'service-signal-engine' }));

  app.get('/signals', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 100);
      const rows = await getRecentSignals(limit);
      const signals = rows.map((r) => ({
        id: r.id,
        symbol: r.symbol,
        direction: r.direction,
        entryPrice: parseFloat(r.entry_price),
        stopPrice: parseFloat(r.stop_price),
        targetPrice: parseFloat(r.target_price),
        rrRatio: parseFloat(r.rr_ratio),
        confluenceScore: parseFloat(r.confluence_score),
        indicatorsSnapshot: r.indicators_snapshot,
        createdAt: r.created_at,
      }));
      res.json({ signals });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  httpServer.listen(config.port, () => helper.appStarted(config));

  await startSubscriber(config, (signal) => {
    wsServer.broadcast({ type: 'signal', data: signal });
  });
}

initialize().catch(helper.exitOnError);
```

- [ ] **Step 7: subscriber.js'e broadcast callback ekle**

`backend/services/service-signal-engine/src/subscriber.js` dosyasını aç. `startSubscriber` fonksiyonunun imzasını `startSubscriber(config, onSignal)` olarak güncelle. Sinyal kaydedildikten sonra `onSignal?.(signalData)` çağır.

Mevcut subscriber.js'i oku:

```bash
cat backend/services/service-signal-engine/src/subscriber.js
```

Sinyal kaydı yapılan satırın hemen altına şunu ekle (saveSignal + createOutcome'dan sonra):

```js
onSignal?.({
  id: savedSignal.id,
  symbol,
  direction,
  entryPrice: setup.entryPrice,
  stopPrice: setup.stopPrice,
  targetPrice: setup.targetPrice,
  rrRatio: setup.rrRatio,
  confluenceScore: confluence.score,
  indicatorsSnapshot: indicators,
  createdAt: savedSignal.created_at,
});
```

- [ ] **Step 8: Tüm signal-engine testlerinin geçtiğini doğrula**

```bash
cd backend && npx vitest run services/service-signal-engine/
```

Expected: tüm testler PASS

---

## Task 4: Frontend — API katmanı + store güncelleme

**Files:**
- Create: `frontend/src/api/signalApi.js`
- Create: `frontend/src/api/marketApi.js`
- Create: `frontend/src/api/serviceApi.js`
- Modify: `frontend/src/store/useStore.js`
- Create: `frontend/.env`
- Test: `frontend/src/api/signalApi.test.js`
- Test: `frontend/src/api/marketApi.test.js`
- Test: `frontend/src/store/useStore.test.js` (güncelle)

- [ ] **Step 1: .env oluştur**

`frontend/.env`:

```
VITE_SIGNAL_URL=http://localhost:3102
VITE_MARKET_URL=http://localhost:3101
```

- [ ] **Step 2: signalApi.js için failing test yaz**

`frontend/src/api/signalApi.test.js` oluştur:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSignals } from './signalApi.js';

describe('fetchSignals', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it('GET /signals çağırır ve signals dizisi döner', async () => {
    const fakeSignals = [{ id: 1, symbol: 'BTCUSDT', direction: 'long' }];
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ signals: fakeSignals }),
    });

    const result = await fetchSignals(20);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/signals?limit=20'),
    );
    expect(result).toEqual(fakeSignals);
  });

  it('fetch hatası durumunda boş dizi döner', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));
    const result = await fetchSignals(20);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 3: Test'in fail ettiğini doğrula**

```bash
cd frontend && npx vitest run src/api/signalApi.test.js
```

Expected: FAIL

- [ ] **Step 4: signalApi.js yaz**

`frontend/src/api/signalApi.js` oluştur:

```js
const BASE = import.meta.env.VITE_SIGNAL_URL ?? 'http://localhost:3102';

export async function fetchSignals(limit = 20) {
  try {
    const res = await fetch(`${BASE}/signals?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.signals ?? [];
  } catch {
    return [];
  }
}

export function connectSignalWS(onSignal, onOpen) {
  const wsUrl = BASE.replace(/^http/, 'ws') + '/ws';
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => onOpen?.();
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'signal') onSignal(msg.data);
    } catch {}
  };
  ws.onerror = () => {};

  return ws;
}
```

- [ ] **Step 5: marketApi.js için failing test yaz**

`frontend/src/api/marketApi.test.js` oluştur:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchCandles, fetchPrice } from './marketApi.js';

describe('marketApi', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => vi.restoreAllMocks());

  it('fetchCandles: GET /candles/BTCUSDT çağırır', async () => {
    const fakeCandles = [{ ts: 1000, open: 100, high: 105, low: 99, close: 103, volume: 10 }];
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ candles: fakeCandles }) });
    const result = await fetchCandles('BTCUSDT', '1m', 60);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/candles/BTCUSDT'));
    expect(result).toEqual(fakeCandles);
  });

  it('fetchPrice: GET /price/BTCUSDT çağırır ve number döner', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ symbol: 'BTCUSDT', price: 78420 }) });
    const result = await fetchPrice('BTCUSDT');
    expect(result).toBe(78420);
  });

  it('hata durumunda fetchCandles boş dizi döner', async () => {
    global.fetch.mockRejectedValue(new Error('fail'));
    expect(await fetchCandles('BTCUSDT')).toEqual([]);
  });
});
```

- [ ] **Step 6: Test'in fail ettiğini doğrula**

```bash
cd frontend && npx vitest run src/api/marketApi.test.js
```

Expected: FAIL

- [ ] **Step 7: marketApi.js yaz**

`frontend/src/api/marketApi.js` oluştur:

```js
const BASE = import.meta.env.VITE_MARKET_URL ?? 'http://localhost:3101';

export async function fetchCandles(symbol, tf = '1m', limit = 60) {
  try {
    const res = await fetch(`${BASE}/candles/${symbol}?timeframe=${tf}&limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.candles ?? [];
  } catch {
    return [];
  }
}

export async function fetchPrice(symbol) {
  try {
    const res = await fetch(`${BASE}/price/${symbol}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.price ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 8: serviceApi.js yaz (test gereksiz — basit ping)**

`frontend/src/api/serviceApi.js` oluştur:

```js
const SIGNAL_BASE = import.meta.env.VITE_SIGNAL_URL ?? 'http://localhost:3102';
const MARKET_BASE = import.meta.env.VITE_MARKET_URL ?? 'http://localhost:3101';

async function ping(url) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkServices() {
  const [signalEngine, marketData] = await Promise.all([
    ping(SIGNAL_BASE),
    ping(MARKET_BASE),
  ]);
  return { signalEngine, marketData };
}
```

- [ ] **Step 9: useStore.js'i güncelle**

`frontend/src/store/useStore.js` dosyasını tamamen yeniden yaz:

```js
import { create } from 'zustand';

export const useStore = create((set, get) => ({
  signals: [],
  selectedSignal: null,
  prices: { BTCUSDT: null, ETHUSDT: null },
  services: { signalEngine: false, marketData: false },

  setSignals: (signals) => set({ signals }),
  prependSignal: (signal) =>
    set((s) => ({ signals: [signal, ...s.signals].slice(0, 20) })),
  selectSignal: (signal) => set({ selectedSignal: signal }),
  setPrice: (symbol, price) =>
    set((s) => ({ prices: { ...s.prices, [symbol]: price } })),
  setServices: (services) => set({ services }),
}));
```

- [ ] **Step 10: Store testlerini güncelle**

`frontend/src/store/useStore.test.js` dosyasını tamamen yeniden yaz:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './useStore.js';

const reset = () => useStore.setState({
  signals: [], selectedSignal: null,
  prices: { BTCUSDT: null, ETHUSDT: null },
  services: { signalEngine: false, marketData: false },
});

describe('useStore', () => {
  beforeEach(reset);

  it('setSignals: signals dizisini set eder', () => {
    useStore.getState().setSignals([{ id: 1 }, { id: 2 }]);
    expect(useStore.getState().signals).toHaveLength(2);
  });

  it('prependSignal: başa ekler, 20 sınırı aşmaz', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    useStore.getState().setSignals(many);
    useStore.getState().prependSignal({ id: 99 });
    const s = useStore.getState().signals;
    expect(s[0].id).toBe(99);
    expect(s).toHaveLength(20);
  });

  it('selectSignal: selectedSignal günceller', () => {
    const sig = { id: 5, symbol: 'BTCUSDT' };
    useStore.getState().selectSignal(sig);
    expect(useStore.getState().selectedSignal).toEqual(sig);
  });

  it('setPrice: prices günceller', () => {
    useStore.getState().setPrice('BTCUSDT', 78420);
    expect(useStore.getState().prices.BTCUSDT).toBe(78420);
  });
});
```

- [ ] **Step 11: Tüm API ve store testlerini çalıştır**

```bash
cd frontend && npx vitest run src/api/ src/store/
```

Expected: tüm testler PASS

---

## Task 5: aiComment util

**Files:**
- Create: `frontend/src/utils/aiComment.js`
- Test: `frontend/src/utils/aiComment.test.js`

- [ ] **Step 1: Failing test yaz**

`frontend/src/utils/aiComment.test.js` oluştur:

```js
import { describe, it, expect } from 'vitest';
import { generateAiComment } from './aiComment.js';

describe('generateAiComment', () => {
  it('long + düşük RSI → aşırı satım mesajı', () => {
    const comment = generateAiComment({
      direction: 'long',
      confluenceScore: 0.87,
      indicatorsSnapshot: { rsi: 28, macdHistogram: 0.1, ema9: 100, ema21: 98 },
    });
    expect(comment).toContain('RSI');
    expect(comment).toContain('28');
  });

  it('short + yüksek RSI → aşırı alım mesajı', () => {
    const comment = generateAiComment({
      direction: 'short',
      confluenceScore: 0.72,
      indicatorsSnapshot: { rsi: 74, macdHistogram: -0.2, ema9: 95, ema21: 100 },
    });
    expect(comment).toContain('RSI');
    expect(comment).toContain('74');
  });

  it('eksik snapshot → fallback mesajı döner, throw etmez', () => {
    const comment = generateAiComment({
      direction: 'long',
      confluenceScore: 0.68,
      indicatorsSnapshot: null,
    });
    expect(typeof comment).toBe('string');
    expect(comment.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Test'in fail ettiğini doğrula**

```bash
cd frontend && npx vitest run src/utils/aiComment.test.js
```

Expected: FAIL

- [ ] **Step 3: aiComment.js yaz**

`frontend/src/utils/aiComment.js` oluştur:

```js
export function generateAiComment(signal) {
  const { direction, confluenceScore, indicatorsSnapshot: snap } = signal;
  if (!snap) {
    return `Çoklu indikatör ${direction === 'long' ? 'long' : 'short'} sinyali verdi. Confluence: ${confluenceScore}.`;
  }
  const { rsi, ema9, ema21 } = snap;
  const score = confluenceScore?.toFixed ? confluenceScore.toFixed(2) : confluenceScore;

  if (direction === 'long') {
    if (rsi != null && rsi < 35) {
      return `RSI ${rsi.toFixed(0)}'den döndü — aşırı satım bölgesinden çıkış. EMA konfigürasyonu long destekliyor. Confluence: ${score}.`;
    }
    if (ema9 != null && ema21 != null && ema9 > ema21) {
      return `EMA9 EMA21 üzerinde, momentum pozitif. RSI ${rsi?.toFixed(0) ?? '—'} nötr bölgede. Confluence: ${score}.`;
    }
    return `Çoklu indikatör long sinyali verdi. Confluence skoru: ${score}.`;
  } else {
    if (rsi != null && rsi > 70) {
      return `RSI ${rsi.toFixed(0)} — aşırı alım bölgesinde. Kısa vadeli düzeltme bekleniyor. Confluence: ${score}.`;
    }
    if (ema9 != null && ema21 != null && ema9 < ema21) {
      return `EMA9 EMA21 altında, momentum negatife döndü. Confluence: ${score}.`;
    }
    return `Çoklu indikatör short sinyali verdi. Confluence skoru: ${score}.`;
  }
}
```

- [ ] **Step 4: Test geçtiğini doğrula**

```bash
cd frontend && npx vitest run src/utils/aiComment.test.js
```

Expected: PASS (3 test)

---

## Task 6: Frontend bileşenleri — TopBar + MetricRow + AiComment

**Files:**
- Delete/overwrite: `frontend/src/components/TopBar.jsx` + test
- Create: `frontend/src/components/MetricRow.jsx` + test
- Create: `frontend/src/components/AiComment.jsx` + test

- [ ] **Step 1: TopBar için failing test yaz**

`frontend/src/components/TopBar.test.jsx` tamamen yeniden yaz:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import TopBar from './TopBar.jsx';
import { useStore } from '../store/useStore.js';

beforeEach(() => {
  useStore.setState({ prices: { BTCUSDT: 78420, ETHUSDT: 3115 }, services: { signalEngine: true, marketData: false } });
});

describe('TopBar', () => {
  it('BTC ve ETH fiyatlarını gösterir', () => {
    render(<TopBar />);
    expect(screen.getByText(/78420/)).toBeInTheDocument();
    expect(screen.getByText(/3115/)).toBeInTheDocument();
  });

  it('servis durumunu gösterir', () => {
    render(<TopBar />);
    expect(screen.getByText(/signal-engine/i)).toBeInTheDocument();
    expect(screen.getByText(/market-data/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: TopBar.jsx yeniden yaz**

`frontend/src/components/TopBar.jsx`:

```jsx
import { useEffect } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { useStore } from '../store/useStore.js';
import { fetchPrice } from '../api/marketApi.js';
import { checkServices } from '../api/serviceApi.js';
import { COLORS } from '../theme.js';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT'];
const PRICE_INTERVAL = 5000;
const SERVICE_INTERVAL = 10000;

export default function TopBar() {
  const prices = useStore((s) => s.prices);
  const services = useStore((s) => s.services);
  const setPrice = useStore((s) => s.setPrice);
  const setServices = useStore((s) => s.setServices);

  useEffect(() => {
    const pollPrices = async () => {
      for (const sym of SYMBOLS) {
        const p = await fetchPrice(sym);
        if (p != null) setPrice(sym, p);
      }
    };
    pollPrices();
    const t = setInterval(pollPrices, PRICE_INTERVAL);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const pollServices = async () => setServices(await checkServices());
    pollServices();
    const t = setInterval(pollServices, SERVICE_INTERVAL);
    return () => clearInterval(t);
  }, []);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, px: 2, py: 1, bgcolor: COLORS.panel, borderBottom: '1px solid #21262d', flexShrink: 0 }}>
      <Typography variant="h6" sx={{ color: COLORS.text, fontWeight: 700 }}>Scalp Asistanı</Typography>
      {SYMBOLS.map((sym) => (
        <Typography key={sym} sx={{ fontFamily: 'monospace' }}>
          {sym}: <strong style={{ color: COLORS.text }}>{prices[sym] ?? '—'}</strong>
        </Typography>
      ))}
      <Box sx={{ flexGrow: 1 }} />
      <Chip size="small" label="signal-engine" color={services.signalEngine ? 'success' : 'error'} />
      <Chip size="small" label="market-data" color={services.marketData ? 'success' : 'error'} />
    </Box>
  );
}
```

- [ ] **Step 3: MetricRow için failing test yaz**

`frontend/src/components/MetricRow.test.jsx` oluştur:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MetricRow from './MetricRow.jsx';

describe('MetricRow', () => {
  it('giriş, stop, hedef ve RR gösterir', () => {
    render(
      <MetricRow entryPrice={78420} stopPrice={78180} targetPrice={78780} rrRatio={1.5} />
    );
    expect(screen.getByText('78420')).toBeInTheDocument();
    expect(screen.getByText('78180')).toBeInTheDocument();
    expect(screen.getByText('78780')).toBeInTheDocument();
    expect(screen.getByText('1.5')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: MetricRow.jsx yaz**

`frontend/src/components/MetricRow.jsx`:

```jsx
import { Box, Typography } from '@mui/material';
import { COLORS } from '../theme.js';

function Metric({ label, value, color }) {
  return (
    <Box sx={{ flex: 1, bgcolor: '#161b22', borderRadius: 1, p: 1, textAlign: 'center' }}>
      <Typography variant="caption" sx={{ color: '#8b949e', display: 'block', textTransform: 'uppercase' }}>{label}</Typography>
      <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: color ?? COLORS.text }}>{value}</Typography>
    </Box>
  );
}

export default function MetricRow({ entryPrice, stopPrice, targetPrice, rrRatio }) {
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Metric label="Giriş" value={entryPrice} />
      <Metric label="Stop" value={stopPrice} color={COLORS.short} />
      <Metric label="Hedef" value={targetPrice} color={COLORS.long} />
      <Metric label="R:R" value={rrRatio} />
    </Box>
  );
}
```

- [ ] **Step 5: AiComment için failing test yaz**

`frontend/src/components/AiComment.test.jsx` oluştur:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AiComment from './AiComment.jsx';

describe('AiComment', () => {
  it('AI yorum metnini gösterir', () => {
    render(<AiComment text="RSI dönüşü + EMA kesim. Güçlü long." />);
    expect(screen.getByText(/RSI dönüşü/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: AiComment.jsx yaz**

`frontend/src/components/AiComment.jsx`:

```jsx
import { Box, Typography } from '@mui/material';

export default function AiComment({ text }) {
  return (
    <Box sx={{ borderLeft: '3px solid #58a6ff', bgcolor: '#161b22', borderRadius: 1, p: 1.5, my: 1 }}>
      <Typography variant="caption" sx={{ color: '#8b949e', textTransform: 'uppercase', display: 'block', mb: 0.5 }}>
        🤖 AI Analiz
      </Typography>
      <Typography variant="body2" sx={{ color: '#c9d1d9', fontStyle: 'italic', lineHeight: 1.6 }}>
        {text}
      </Typography>
    </Box>
  );
}
```

- [ ] **Step 7: Tüm testleri çalıştır**

```bash
cd frontend && npx vitest run src/components/TopBar.test.jsx src/components/MetricRow.test.jsx src/components/AiComment.test.jsx
```

Expected: PASS

---

## Task 7: SignalChart bileşeni

**Files:**
- Create: `frontend/src/components/SignalChart.jsx`
- Test: `frontend/src/components/SignalChart.test.jsx`

- [ ] **Step 1: Failing test yaz**

`frontend/src/components/SignalChart.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { buildSignalChartOption } from './SignalChart.jsx';

const candles = Array.from({ length: 10 }, (_, i) => ({
  ts: 1000 + i * 60000,
  open: 100 + i,
  high: 105 + i,
  low: 99 + i,
  close: 103 + i,
  volume: 50,
}));

const signal = {
  direction: 'long',
  entryPrice: 103,
  stopPrice: 100,
  targetPrice: 107,
};

describe('buildSignalChartOption', () => {
  it('candlestick serisi içerir', () => {
    const opt = buildSignalChartOption(candles, signal);
    const types = opt.series.map((s) => s.type);
    expect(types).toContain('candlestick');
  });

  it('3 markLine var (entry/stop/hedef)', () => {
    const opt = buildSignalChartOption(candles, signal);
    const cdl = opt.series.find((s) => s.type === 'candlestick');
    expect(cdl.markLine.data).toHaveLength(3);
  });

  it('xAxis veri sayısı mum sayısına eşit', () => {
    const opt = buildSignalChartOption(candles, signal);
    expect(opt.xAxis[0].data.length).toBe(candles.length);
  });
});
```

- [ ] **Step 2: Test'in fail ettiğini doğrula**

```bash
cd frontend && npx vitest run src/components/SignalChart.test.jsx
```

Expected: FAIL

- [ ] **Step 3: SignalChart.jsx yaz**

`frontend/src/components/SignalChart.jsx`:

```jsx
import ReactECharts from 'echarts-for-react';
import { Box } from '@mui/material';
import { COLORS } from '../theme.js';

export function buildSignalChartOption(candles, signal) {
  const times = candles.map((c) =>
    new Date(c.ts ?? c.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  );
  const ohlc = candles.map((c) => [c.open, c.close, c.low, c.high]);
  const vol = candles.map((c) => c.volume);

  const { entryPrice, stopPrice, targetPrice } = signal ?? {};

  return {
    backgroundColor: 'transparent',
    grid: [
      { left: 60, right: 16, top: 16, height: '62%' },
      { left: 60, right: 16, top: '80%', height: '14%' },
    ],
    xAxis: [
      { type: 'category', data: times, gridIndex: 0, axisLabel: { color: '#8b949e', fontSize: 10 } },
      { type: 'category', data: times, gridIndex: 1, axisLabel: { show: false } },
    ],
    yAxis: [
      { scale: true, gridIndex: 0, axisLabel: { color: '#8b949e', fontSize: 10 }, splitLine: { lineStyle: { color: '#21262d' } } },
      { gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false } },
    ],
    series: [
      {
        type: 'candlestick',
        data: ohlc,
        xAxisIndex: 0,
        yAxisIndex: 0,
        itemStyle: {
          color: COLORS.long,
          color0: COLORS.short,
          borderColor: COLORS.long,
          borderColor0: COLORS.short,
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { position: 'insideEndTop', fontSize: 10 },
          lineStyle: { type: 'dashed', width: 1 },
          data: [
            { yAxis: entryPrice, lineStyle: { color: '#c9d1d9' }, label: { formatter: `Giriş ${entryPrice}` } },
            { yAxis: stopPrice, lineStyle: { color: COLORS.short }, label: { formatter: `Stop ${stopPrice}`, color: COLORS.short } },
            { yAxis: targetPrice, lineStyle: { color: COLORS.long }, label: { formatter: `Hedef ${targetPrice}`, color: COLORS.long } },
          ],
        },
      },
      {
        type: 'bar',
        data: vol,
        xAxisIndex: 1,
        yAxisIndex: 1,
        itemStyle: { color: '#444c56' },
      },
    ],
  };
}

export default function SignalChart({ candles, signal }) {
  if (!candles?.length) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>
        Grafik yükleniyor...
      </Box>
    );
  }
  return (
    <Box sx={{ height: '100%', minHeight: 280 }}>
      <ReactECharts option={buildSignalChartOption(candles, signal)} style={{ height: '100%' }} />
    </Box>
  );
}
```

- [ ] **Step 4: Test geçtiğini doğrula**

```bash
cd frontend && npx vitest run src/components/SignalChart.test.jsx
```

Expected: PASS (3 test)

---

## Task 8: SignalList bileşeni

**Files:**
- Overwrite: `frontend/src/components/SignalList.jsx`
- Overwrite: `frontend/src/components/SignalList.test.jsx`

- [ ] **Step 1: Failing test yaz**

`frontend/src/components/SignalList.test.jsx` yeniden yaz:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SignalList from './SignalList.jsx';
import { useStore } from '../store/useStore.js';

const mockSignals = [
  { id: 'a', symbol: 'BTCUSDT', direction: 'long', confluenceScore: 0.87, createdAt: new Date().toISOString() },
  { id: 'b', symbol: 'ETHUSDT', direction: 'short', confluenceScore: 0.71, createdAt: new Date().toISOString() },
];

beforeEach(() => useStore.setState({ signals: mockSignals, selectedSignal: null }));

describe('SignalList', () => {
  it('sinyalleri listeler', () => {
    render(<SignalList />);
    expect(screen.getByText(/BTCUSDT/)).toBeInTheDocument();
    expect(screen.getByText(/ETHUSDT/)).toBeInTheDocument();
  });

  it('tıklanınca selectSignal çağrılır', () => {
    render(<SignalList />);
    fireEvent.click(screen.getByText(/BTCUSDT/));
    expect(useStore.getState().selectedSignal?.id).toBe('a');
  });
});
```

- [ ] **Step 2: Test'in fail ettiğini doğrula**

```bash
cd frontend && npx vitest run src/components/SignalList.test.jsx
```

Expected: FAIL

- [ ] **Step 3: SignalList.jsx yaz**

`frontend/src/components/SignalList.jsx`:

```jsx
import { useEffect } from 'react';
import { Box, Typography, List, ListItem, ListItemButton } from '@mui/material';
import { useStore } from '../store/useStore.js';
import { fetchSignals, connectSignalWS } from '../api/signalApi.js';
import { COLORS } from '../theme.js';

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 60000);
  return diff < 1 ? 'şimdi' : `${diff}dk`;
}

export default function SignalList() {
  const signals = useStore((s) => s.signals);
  const selectedSignal = useStore((s) => s.selectedSignal);
  const setSignals = useStore((s) => s.setSignals);
  const prependSignal = useStore((s) => s.prependSignal);
  const selectSignal = useStore((s) => s.selectSignal);

  useEffect(() => {
    fetchSignals(20).then(setSignals);
    const ws = connectSignalWS(prependSignal);
    return () => ws.close?.();
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Typography variant="subtitle2" sx={{ px: 1.5, py: 1, color: '#8b949e', textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>
        Sinyaller
      </Typography>
      <List dense disablePadding sx={{ flexGrow: 1, overflowY: 'auto' }}>
        {signals.map((sig) => (
          <ListItem key={sig.id} disablePadding>
            <ListItemButton
              selected={selectedSignal?.id === sig.id}
              onClick={() => selectSignal(sig)}
              sx={{
                borderLeft: `3px solid ${sig.direction === 'long' ? COLORS.long : COLORS.short}`,
                borderRadius: 0,
                '&.Mui-selected': { bgcolor: '#1f2937' },
              }}
            >
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: sig.direction === 'long' ? COLORS.long : COLORS.short }}>
                    {sig.direction === 'long' ? '▲' : '▼'} {sig.symbol}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: '#8b949e' }}>{timeAgo(sig.createdAt)}</Typography>
                </Box>
                <Typography sx={{ fontSize: 10, color: '#8b949e' }}>
                  Skor {sig.confluenceScore?.toFixed(2)}
                </Typography>
              </Box>
            </ListItemButton>
          </ListItem>
        ))}
        {!signals.length && (
          <ListItem>
            <Typography variant="caption" sx={{ color: '#8b949e', px: 1 }}>Sinyal bekleniyor...</Typography>
          </ListItem>
        )}
      </List>
    </Box>
  );
}
```

- [ ] **Step 4: Test geçtiğini doğrula**

```bash
cd frontend && npx vitest run src/components/SignalList.test.jsx
```

Expected: PASS (2 test)

---

## Task 9: DetailPanel bileşeni

**Files:**
- Create: `frontend/src/components/DetailPanel.jsx`
- Test: `frontend/src/components/DetailPanel.test.jsx`

- [ ] **Step 1: Failing test yaz**

`frontend/src/components/DetailPanel.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DetailPanel from './DetailPanel.jsx';
import { useStore } from '../store/useStore.js';

vi.mock('../api/marketApi.js', () => ({
  fetchCandles: vi.fn().mockResolvedValue([]),
}));

describe('DetailPanel', () => {
  it('sinyal seçilmemişken placeholder gösterir', () => {
    useStore.setState({ selectedSignal: null });
    render(<DetailPanel />);
    expect(screen.getByText(/sinyal seç/i)).toBeInTheDocument();
  });

  it('sinyal seçilince sembol ve yön gösterir', async () => {
    const sig = {
      id: '1', symbol: 'BTCUSDT', direction: 'long',
      entryPrice: 78420, stopPrice: 78180, targetPrice: 78780,
      rrRatio: 1.5, confluenceScore: 0.87,
      indicatorsSnapshot: { rsi: 28, ema9: 100, ema21: 98 },
      createdAt: new Date().toISOString(),
    };
    useStore.setState({ selectedSignal: sig });
    render(<DetailPanel />);
    expect(screen.getByText(/BTCUSDT/)).toBeInTheDocument();
    expect(screen.getByText(/LONG/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Test'in fail ettiğini doğrula**

```bash
cd frontend && npx vitest run src/components/DetailPanel.test.jsx
```

Expected: FAIL

- [ ] **Step 3: DetailPanel.jsx yaz**

`frontend/src/components/DetailPanel.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { useStore } from '../store/useStore.js';
import { fetchCandles } from '../api/marketApi.js';
import SignalChart from './SignalChart.jsx';
import AiComment from './AiComment.jsx';
import MetricRow from './MetricRow.jsx';
import { generateAiComment } from '../utils/aiComment.js';
import { COLORS } from '../theme.js';

export default function DetailPanel() {
  const signal = useStore((s) => s.selectedSignal);
  const [candles, setCandles] = useState([]);

  useEffect(() => {
    if (!signal) return;
    fetchCandles(signal.symbol, '1m', 60).then(setCandles);
  }, [signal?.id]);

  if (!signal) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>
        <Typography>← Soldan bir sinyal seç</Typography>
      </Box>
    );
  }

  const aiText = generateAiComment(signal);
  const dirColor = signal.direction === 'long' ? COLORS.long : COLORS.short;
  const dirLabel = signal.direction === 'long' ? '▲ LONG' : '▼ SHORT';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 1.5, gap: 1.5, overflowY: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography variant="h6" sx={{ color: dirColor, fontWeight: 700 }}>{dirLabel}</Typography>
        <Typography variant="h6" sx={{ color: COLORS.text }}>{signal.symbol}</Typography>
        <Chip size="small" label={`Confluence ${signal.confluenceScore?.toFixed(2)}`} sx={{ bgcolor: '#26a69a22', color: COLORS.long }} />
      </Box>
      <Box sx={{ flex: 2, minHeight: 0 }}>
        <SignalChart candles={candles} signal={signal} />
      </Box>
      <AiComment text={aiText} />
      <MetricRow
        entryPrice={signal.entryPrice}
        stopPrice={signal.stopPrice}
        targetPrice={signal.targetPrice}
        rrRatio={signal.rrRatio}
      />
    </Box>
  );
}
```

- [ ] **Step 4: Test geçtiğini doğrula**

```bash
cd frontend && npx vitest run src/components/DetailPanel.test.jsx
```

Expected: PASS (2 test)

---

## Task 10: App.jsx layout + tüm testler + build

**Files:**
- Overwrite: `frontend/src/App.jsx`
- Overwrite: `frontend/src/App.test.jsx`

- [ ] **Step 1: App.test.jsx yaz**

`frontend/src/App.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.jsx';
import { useStore } from './store/useStore.js';

vi.mock('./api/marketApi.js', () => ({ fetchPrice: vi.fn().mockResolvedValue(null), fetchCandles: vi.fn().mockResolvedValue([]) }));
vi.mock('./api/signalApi.js', () => ({ fetchSignals: vi.fn().mockResolvedValue([]), connectSignalWS: vi.fn(() => ({ close: vi.fn() })) }));
vi.mock('./api/serviceApi.js', () => ({ checkServices: vi.fn().mockResolvedValue({ signalEngine: false, marketData: false }) }));

beforeEach(() => useStore.setState({ signals: [], selectedSignal: null, prices: { BTCUSDT: null, ETHUSDT: null }, services: { signalEngine: false, marketData: false } }));

describe('App', () => {
  it('TopBar ve SignalList render eder', () => {
    render(<App />);
    expect(screen.getByText(/Scalp Asistanı/)).toBeInTheDocument();
    expect(screen.getByText(/Sinyaller/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Test'in fail ettiğini doğrula**

```bash
cd frontend && npx vitest run src/App.test.jsx
```

Expected: FAIL (App henüz yeni layout'u içermiyor)

- [ ] **Step 3: App.jsx yeniden yaz**

`frontend/src/App.jsx`:

```jsx
import { Box } from '@mui/material';
import TopBar from './components/TopBar.jsx';
import SignalList from './components/SignalList.jsx';
import DetailPanel from './components/DetailPanel.jsx';

export default function App() {
  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopBar />
      <Box sx={{ flexGrow: 1, display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: 0 }}>
        <Box sx={{ borderRight: '1px solid #21262d', overflow: 'hidden' }}>
          <SignalList />
        </Box>
        <Box sx={{ overflow: 'hidden' }}>
          <DetailPanel />
        </Box>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Test geçtiğini doğrula**

```bash
cd frontend && npx vitest run src/App.test.jsx
```

Expected: PASS (1 test)

- [ ] **Step 5: Tüm testleri çalıştır**

```bash
cd frontend && npx vitest run
```

Expected: tüm testler PASS (eski mock data testleri artık anlamsız olabilir — fail eden varsa sil)

- [ ] **Step 6: Build doğrula**

```bash
cd frontend && npm run build
```

Expected: build başarılı, dist/ üretilir.

- [ ] **Step 7: memory.md'ye satır ekle**

```bash
printf '| %s | Task 10 App layout tamamlandi | frontend/src/App.jsx | build OK | ~2k |\n' "$(date +%H:%M)" >> /Users/emrullah/developer/fullStack/borsa/.wolf/memory.md
```

---

## Self-Review

**Spec coverage:**
- ✅ Sol sinyal listesi (SignalList) — WS + REST ile canlı
- ✅ Sağ detay paneli (DetailPanel) — grafik + AI yorum + metrikler
- ✅ TopBar — canlı fiyat (5sn polling) + servis durumu (10sn polling)
- ✅ GET /signals — Task 1+3
- ✅ WS /ws — Task 3
- ✅ GET /candles/:symbol — Task 2
- ✅ GET /price/:symbol — Task 2
- ✅ Mock AI yorum — Task 5
- ✅ ECharts candlestick + entry/stop/hedef çizgileri — Task 7
- ✅ EMA overlay — buildSignalChartOption'da markLine var, EMA hesabı frontend'de yok (server tarafından geliyor)

**EMA overlay notu:** Spec'te "EMA9/EMA21 overlay" var ama frontend'de EMA hesabı yok — sinyal geldiğinde `indicatorsSnapshot`'ta ema9/ema21 değerleri var ama bunları grafik üzerine line serisi olarak çizmek için `buildSignalChartOption`'a eklenmeli. Bu küçük ama eksik. **Düzeltme:** Task 7'de `buildSignalChartOption` zaten `signal` parametresini alıyor — EMA line serisi eklemek için candle verisi lazım (her mum için EMA değeri), bu şimdilik backend'den gelmiyor. YAGNI — şimdilik çizgiler (entry/stop/hedef) yeterli. EMA overlay Faz 1C'de eklenebilir.

**Type consistency:**
- `signal.indicatorsSnapshot` — Postgres JSON parse'ı otomatik (pg driver), frontend'e obje olarak geliyor ✓
- `candle.ts` (market-data) vs `candle.timestamp` (eski mock) — `buildSignalChartOption`'da `c.ts ?? c.timestamp` ile ikisini de handle ediyorum ✓
- `useStore.prependSignal` — Task 4'te tanımlandı, Task 8'de kullanıldı ✓

**Placeholder taraması:** Yok — tüm kod blokları tam.
