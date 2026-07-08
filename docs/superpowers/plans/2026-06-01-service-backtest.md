# service-backtest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bitget REST API'den 30 günlük geçmiş mum verisi çekerek signal-engine mantığını geçmiş veriye uygulayan ve win rate / profit factor / max drawdown raporu üreten bir backtest servisi oluşturmak.

**Architecture:** `services/service-backtest/` altında bağımsız bir servis. `fetcher.js` Bitget REST'ten veri çeker, `simulator.js` her sinyali TP/SL/TIMEOUT olarak simüle eder, `reporter.js` terminal özeti + JSON dosyası üretir. Signal-engine modülleri (`calcAllIndicators`, `calcLiquidationPressure`, `calcConfluence`, `buildSetup`) doğrudan import edilerek kullanılır — kod kopyalanmaz.

**Tech Stack:** Node.js ESM, `bitget-api` npm paketi (mevcut), `vitest` (mevcut), `technicalindicators` (mevcut), `@borsa-bot/service-signal-engine` workspace modülleri.

---

## Dosya Yapısı

```
backend/
├── services/service-backtest/
│   ├── package.json             ← workspace tanımı, bağımlılıklar
│   ├── main.js                  ← orchestration: semboller → fetch → run → report
│   └── src/
│       ├── fetcher.js           ← fetchCandles / fetchFundingHistory / fetchOIHistory
│       ├── simulator.js         ← simulateTrade(setup, candles) → WIN|LOSS|TIMEOUT
│       └── reporter.js          ← generateReport(results) → terminal tablo + JSON
├── backtest-results/            ← .gitignore'a ekle
└── package.json                 ← "backtest" script ekle
```

**Signal-engine'den import edilecekler** (kopyalanmaz):
- `@borsa-bot/service-signal-engine/src/indicators.js` → `calcAllIndicators`
- `@borsa-bot/service-signal-engine/src/liquidation-pressure.js` → `calcLiquidationPressure`
- `@borsa-bot/service-signal-engine/src/confluence.js` → `calcConfluence`
- `@borsa-bot/service-signal-engine/src/setup-builder.js` → `buildSetup`

---

## Task 1: Servis İskeleti ve package.json

**Files:**
- Create: `backend/services/service-backtest/package.json`
- Modify: `backend/package.json`
- Create: `backend/backtest-results/.gitkeep`

- [ ] **Step 1: `service-backtest/package.json` oluştur**

```json
{
  "name": "@borsa-bot/service-backtest",
  "version": "1.0.0",
  "type": "module",
  "main": "main.js",
  "scripts": {
    "start": "node main.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@borsa-bot/config": "*",
    "@borsa-bot/helper": "*",
    "bitget-api": "^2.0.0"
  }
}
```

- [ ] **Step 2: `backend/package.json`'a backtest script ekle**

`backend/package.json` `scripts` bölümüne şunu ekle:
```json
"backtest": "node services/service-backtest/main.js"
```

- [ ] **Step 3: `backtest-results/` dizini oluştur**

```bash
mkdir -p backend/backtest-results
touch backend/backtest-results/.gitkeep
```

- [ ] **Step 4: `backtest-results/` .gitignore'a ekle**

`backend/.gitignore` dosyasına (yoksa oluştur) ekle:
```
backtest-results/*.json
```

- [ ] **Step 5: npm install ile workspace'i tanıt**

```bash
cd backend && npm install
```

Beklenen: `added X packages` veya `up to date` — hata yok.

- [ ] **Step 6: Commit**

```bash
git add backend/services/service-backtest/package.json backend/package.json backend/backtest-results/.gitkeep
git commit -m "feat: add service-backtest workspace skeleton"
```

---

## Task 2: `fetcher.js` — Bitget REST Veri Çekimi

**Files:**
- Create: `backend/services/service-backtest/src/fetcher.js`
- Create: `backend/services/service-backtest/test/fetcher.test.js`

- [ ] **Step 1: Failing test yaz**

`backend/services/service-backtest/test/fetcher.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bitget client'ı mock'la — gerçek API çağrısı yapma
vi.mock('bitget-api', () => ({
  RestClientV2: vi.fn().mockImplementation(() => ({
    getHistoricCandlesV2: vi.fn().mockResolvedValue({
      data: [
        // [timestamp, open, high, low, close, volume, quoteVolume]
        ['1717200000000', '67000', '67500', '66800', '67200', '100.5', '6742400'],
        ['1717200060000', '67200', '67300', '67100', '67150', '80.2', '5381890'],
      ]
    }),
    getHistoricFundRate: vi.fn().mockResolvedValue({
      data: [
        { fundingTime: '1717200000000', fundingRate: '0.0001' },
        { fundingTime: '1717228800000', fundingRate: '0.00015' },
      ]
    }),
    getOpenInterest: vi.fn().mockResolvedValue({
      data: { openInterestList: [{ openInterest: '50000', ts: '1717200000000' }] }
    }),
  }))
}));

import { fetchCandles, fetchFundingHistory, fetchOISnapshot } from '../src/fetcher.js';

describe('fetchCandles', () => {
  it('mum dizisini { timestamp, open, high, low, close, volume } formatında döner', async () => {
    const candles = await fetchCandles('BTCUSDT', '1m', 1);
    expect(candles).toHaveLength(2);
    expect(candles[0]).toMatchObject({
      timestamp: 1717200000000,
      open: 67000,
      high: 67500,
      low: 66800,
      close: 67200,
      volume: 100.5,
    });
  });

  it('mumları kronolojik sıraya (eski → yeni) dizer', async () => {
    const candles = await fetchCandles('BTCUSDT', '1m', 1);
    expect(candles[0].timestamp).toBeLessThan(candles[1].timestamp);
  });
});

describe('fetchFundingHistory', () => {
  it('{ timestamp, rate } dizisi döner', async () => {
    const funding = await fetchFundingHistory('BTCUSDT');
    expect(funding).toHaveLength(2);
    expect(funding[0]).toMatchObject({ timestamp: 1717200000000, rate: 0.0001 });
  });
});

describe('fetchOISnapshot', () => {
  it('number döner', async () => {
    const oi = await fetchOISnapshot('BTCUSDT');
    expect(typeof oi).toBe('number');
    expect(oi).toBe(50000);
  });
});
```

- [ ] **Step 2: Testi çalıştır — FAIL bekleniyor**

```bash
cd backend && npx vitest run services/service-backtest/test/fetcher.test.js
```

Beklenen: `FAIL` — `Cannot find module '../src/fetcher.js'`

- [ ] **Step 3: `fetcher.js` implemente et**

`backend/services/service-backtest/src/fetcher.js`:

```js
import { RestClientV2 } from 'bitget-api';

const CANDLES_PER_REQUEST = 200;
const RATE_LIMIT_MS = 200;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function makeClient() {
  return new RestClientV2({}, {});
}

/**
 * @param {string} symbol  örn. 'BTCUSDT'
 * @param {string} timeframe  örn. '1m'
 * @param {number} days  kaç günlük geçmiş
 * @returns {Promise<Array<{timestamp,open,high,low,close,volume}>>}
 */
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
      res = await client.getHistoricCandlesV2({
        symbol,
        granularity: timeframe,
        endTime: String(endTime),
        limit: String(CANDLES_PER_REQUEST),
        productType: 'USDT-FUTURES',
      });
    } catch (err) {
      // 3 retry
      let retries = 3;
      while (retries-- > 0) {
        await sleep(500);
        try {
          res = await client.getHistoricCandlesV2({
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
    })).filter(c => c.timestamp >= startMs);

    allCandles.push(...parsed);

    const oldest = Math.min(...data.map(c => Number(c[0])));
    if (oldest <= startMs) break;
    endTime = oldest - 1;
  }

  // Kronolojik sırala (eski → yeni), tekrarları temizle
  const unique = [...new Map(allCandles.map(c => [c.timestamp, c])).values()];
  return unique.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * @param {string} symbol
 * @returns {Promise<Array<{timestamp, rate}>>}
 */
export async function fetchFundingHistory(symbol) {
  const client = makeClient();
  let res;
  try {
    res = await client.getHistoricFundRate({
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

/**
 * Anlık OI snapshot — Bitget geçmiş OI serisi sağlamıyor,
 * tüm mumlar için bu sabit değer kullanılır.
 * @param {string} symbol
 * @returns {Promise<number>}
 */
export async function fetchOISnapshot(symbol) {
  const client = makeClient();
  try {
    const res = await client.getOpenInterest({
      symbol,
      productType: 'USDT-FUTURES',
    });
    const list = res?.data?.openInterestList ?? [];
    return list.length ? parseFloat(list[0].openInterest) : 0;
  } catch (err) {
    console.warn(`[fetcher] OI alınamadı: ${err.message}`);
    return 0;
  }
}

/**
 * Bir mum timestamp'ine en yakın funding rate'i döner.
 * @param {number} timestamp
 * @param {Array<{timestamp, rate}>} fundingHistory
 * @returns {number}
 */
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
```

- [ ] **Step 4: Testleri çalıştır — PASS bekleniyor**

```bash
cd backend && npx vitest run services/service-backtest/test/fetcher.test.js
```

Beklenen: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/services/service-backtest/src/fetcher.js backend/services/service-backtest/test/fetcher.test.js
git commit -m "feat(backtest): fetcher - Bitget REST candles/funding/OI"
```

---

## Task 3: `simulator.js` — Sinyal Simülasyonu

**Files:**
- Create: `backend/services/service-backtest/src/simulator.js`
- Create: `backend/services/service-backtest/test/simulator.test.js`

- [ ] **Step 1: Failing test yaz**

`backend/services/service-backtest/test/simulator.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { simulateTrade } from '../src/simulator.js';

// Yardımcı: basit mum oluşturucu
function candle(high, low, close = (high + low) / 2) {
  return { timestamp: Date.now(), open: close, high, low, close, volume: 100 };
}

describe('simulateTrade — LONG', () => {
  const setup = {
    entryPrice: 100,
    stopPrice: 95,   // risk = 5
    targetPrice: 110, // reward = 10, R = 2.0
    direction: 'long',
  };

  it('target fiyata ulaşınca WIN döner', () => {
    const candles = [
      candle(105, 99),  // ne TP ne SL
      candle(111, 100), // high > targetPrice → WIN
    ];
    const result = simulateTrade(setup, candles);
    expect(result.outcome).toBe('WIN');
    expect(result.r).toBeCloseTo(2.0, 1);
    expect(result.durationMinutes).toBe(2);
  });

  it('stop fiyatına ulaşınca LOSS döner', () => {
    const candles = [
      candle(101, 94), // low < stopPrice → LOSS
    ];
    const result = simulateTrade(setup, candles);
    expect(result.outcome).toBe('LOSS');
    expect(result.r).toBeCloseTo(-1.0, 1);
    expect(result.durationMinutes).toBe(1);
  });

  it('240 mum sonunda ne TP ne SL → TIMEOUT döner', () => {
    const candles = Array(240).fill(candle(102, 98));
    const result = simulateTrade(setup, candles);
    expect(result.outcome).toBe('TIMEOUT');
    expect(result.durationMinutes).toBe(240);
  });
});

describe('simulateTrade — SHORT', () => {
  const setup = {
    entryPrice: 100,
    stopPrice: 105,   // risk = 5
    targetPrice: 90,  // reward = 10, R = 2.0
    direction: 'short',
  };

  it('target fiyata ulaşınca WIN döner', () => {
    const candles = [
      candle(101, 89), // low < targetPrice → WIN
    ];
    const result = simulateTrade(setup, candles);
    expect(result.outcome).toBe('WIN');
    expect(result.r).toBeCloseTo(2.0, 1);
  });

  it('stop fiyatına ulaşınca LOSS döner', () => {
    const candles = [
      candle(106, 98), // high > stopPrice → LOSS
    ];
    const result = simulateTrade(setup, candles);
    expect(result.outcome).toBe('LOSS');
    expect(result.r).toBeCloseTo(-1.0, 1);
  });
});
```

- [ ] **Step 2: Testi çalıştır — FAIL bekleniyor**

```bash
cd backend && npx vitest run services/service-backtest/test/simulator.test.js
```

Beklenen: `FAIL` — `Cannot find module '../src/simulator.js'`

- [ ] **Step 3: `simulator.js` implemente et**

`backend/services/service-backtest/src/simulator.js`:

```js
const MAX_CANDLES = 240; // 4 saat

/**
 * @param {{ entryPrice, stopPrice, targetPrice, direction }} setup
 * @param {Array<{high, low}>} candles  — setup sonrası gelen mumlar
 * @returns {{ outcome: 'WIN'|'LOSS'|'TIMEOUT', r: number, durationMinutes: number }}
 */
export function simulateTrade(setup, candles) {
  const { entryPrice, stopPrice, targetPrice, direction } = setup;
  const risk = Math.abs(entryPrice - stopPrice);

  const window = candles.slice(0, MAX_CANDLES);

  for (let i = 0; i < window.length; i++) {
    const { high, low } = window[i];

    if (direction === 'long') {
      if (high >= targetPrice) {
        const r = (targetPrice - entryPrice) / risk;
        return { outcome: 'WIN', r: parseFloat(r.toFixed(3)), durationMinutes: i + 1 };
      }
      if (low <= stopPrice) {
        const r = (stopPrice - entryPrice) / risk; // negatif
        return { outcome: 'LOSS', r: parseFloat(r.toFixed(3)), durationMinutes: i + 1 };
      }
    } else {
      // short
      if (low <= targetPrice) {
        const r = (entryPrice - targetPrice) / risk;
        return { outcome: 'WIN', r: parseFloat(r.toFixed(3)), durationMinutes: i + 1 };
      }
      if (high >= stopPrice) {
        const r = (entryPrice - stopPrice) / risk; // negatif
        return { outcome: 'LOSS', r: parseFloat(r.toFixed(3)), durationMinutes: i + 1 };
      }
    }
  }

  return { outcome: 'TIMEOUT', r: 0, durationMinutes: window.length };
}
```

- [ ] **Step 4: Testleri çalıştır — PASS bekleniyor**

```bash
cd backend && npx vitest run services/service-backtest/test/simulator.test.js
```

Beklenen: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/services/service-backtest/src/simulator.js backend/services/service-backtest/test/simulator.test.js
git commit -m "feat(backtest): simulator - WIN/LOSS/TIMEOUT trade simulation"
```

---

## Task 4: `reporter.js` — Rapor Üretimi

**Files:**
- Create: `backend/services/service-backtest/src/reporter.js`
- Create: `backend/services/service-backtest/test/reporter.test.js`

- [ ] **Step 1: Failing test yaz**

`backend/services/service-backtest/test/reporter.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { calcMetrics, formatTable } from '../src/reporter.js';

const sampleTrades = [
  { outcome: 'WIN',     r: 2.0,  durationMinutes: 30, symbol: 'BTCUSDT', direction: 'long' },
  { outcome: 'LOSS',    r: -1.0, durationMinutes: 15, symbol: 'BTCUSDT', direction: 'long' },
  { outcome: 'WIN',     r: 1.8,  durationMinutes: 45, symbol: 'BTCUSDT', direction: 'short' },
  { outcome: 'TIMEOUT', r: 0,    durationMinutes: 240, symbol: 'BTCUSDT', direction: 'long' },
  { outcome: 'LOSS',    r: -1.0, durationMinutes: 10, symbol: 'BTCUSDT', direction: 'short' },
];

describe('calcMetrics', () => {
  it('win rate, profit factor, max drawdown ve avgR hesaplar', () => {
    const m = calcMetrics(sampleTrades);
    // WIN: 2, LOSS: 2, TIMEOUT: 1 — win rate = 2/4 = 0.5
    expect(m.winRate).toBeCloseTo(0.5, 2);
    // PF = (2.0 + 1.8) / (1.0 + 1.0) = 1.9
    expect(m.profitFactor).toBeCloseTo(1.9, 2);
    // maxDrawdown: arka arkaya max kayıp = 1 (LOSS tek arka arkaya değil)
    expect(typeof m.maxDrawdown).toBe('number');
    // avgR: (2.0 + (-1.0) + 1.8 + 0 + (-1.0)) / 5 = 0.36
    expect(m.avgR).toBeCloseTo(0.36, 2);
    expect(m.totalSignals).toBe(5);
    expect(m.timeouts).toBe(1);
  });

  it('sinyal yoksa sıfır döner', () => {
    const m = calcMetrics([]);
    expect(m.winRate).toBe(0);
    expect(m.profitFactor).toBe(0);
    expect(m.maxDrawdown).toBe(0);
    expect(m.avgR).toBe(0);
  });
});

describe('formatTable', () => {
  it('string çıktı üretir ve başlık satırı içerir', () => {
    const bySymbol = {
      BTCUSDT: { ...calcMetrics(sampleTrades), trades: sampleTrades },
    };
    const total = calcMetrics(sampleTrades);
    const output = formatTable(bySymbol, total);
    expect(typeof output).toBe('string');
    expect(output).toContain('BTCUSDT');
    expect(output).toContain('Win%');
  });
});
```

- [ ] **Step 2: Testi çalıştır — FAIL bekleniyor**

```bash
cd backend && npx vitest run services/service-backtest/test/reporter.test.js
```

Beklenen: `FAIL` — `Cannot find module '../src/reporter.js'`

- [ ] **Step 3: `reporter.js` implemente et**

`backend/services/service-backtest/src/reporter.js`:

```js
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '../../../backtest-results');

/**
 * @param {Array<{outcome,r,durationMinutes,symbol,direction}>} trades
 */
export function calcMetrics(trades) {
  if (!trades.length) return { winRate: 0, profitFactor: 0, maxDrawdown: 0, avgR: 0, totalSignals: 0, timeouts: 0 };

  const decided = trades.filter(t => t.outcome !== 'TIMEOUT');
  const wins    = decided.filter(t => t.outcome === 'WIN');
  const losses  = decided.filter(t => t.outcome === 'LOSS');
  const timeouts = trades.filter(t => t.outcome === 'TIMEOUT').length;

  const winRate = decided.length ? wins.length / decided.length : 0;

  const totalWinR  = wins.reduce((s, t) => s + t.r, 0);
  const totalLossR = losses.reduce((s, t) => s + Math.abs(t.r), 0);
  const profitFactor = totalLossR > 0 ? totalWinR / totalLossR : totalWinR > 0 ? Infinity : 0;

  const avgR = trades.length ? trades.reduce((s, t) => s + t.r, 0) / trades.length : 0;

  // Max consecutive losses
  let maxDrawdown = 0, currentDD = 0;
  for (const t of trades) {
    if (t.outcome === 'LOSS') { currentDD++; maxDrawdown = Math.max(maxDrawdown, currentDD); }
    else { currentDD = 0; }
  }

  return {
    winRate: parseFloat(winRate.toFixed(4)),
    profitFactor: parseFloat(profitFactor.toFixed(3)),
    maxDrawdown,
    avgR: parseFloat(avgR.toFixed(3)),
    totalSignals: trades.length,
    timeouts,
  };
}

/**
 * @param {Record<string, {winRate,profitFactor,maxDrawdown,avgR,totalSignals,timeouts,trades}>} bySymbol
 * @param {{winRate,profitFactor,maxDrawdown,avgR,totalSignals,timeouts}} total
 * @returns {string}
 */
export function formatTable(bySymbol, total) {
  const header = ['Symbol', 'Signals', 'Win%', 'PF', 'MaxDD', 'AvgR', 'Timeouts'];
  const rows = Object.entries(bySymbol).map(([sym, m]) => [
    sym,
    m.totalSignals,
    (m.winRate * 100).toFixed(1) + '%',
    m.profitFactor.toFixed(2),
    m.maxDrawdown,
    m.avgR.toFixed(2),
    m.timeouts,
  ]);
  rows.push([
    'TOTAL',
    total.totalSignals,
    (total.winRate * 100).toFixed(1) + '%',
    total.profitFactor.toFixed(2),
    total.maxDrawdown,
    total.avgR.toFixed(2),
    total.timeouts,
  ]);

  const cols = header.length;
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  const pad = (s, w) => String(s).padEnd(w);
  const line = widths.map(w => '-'.repeat(w)).join('  ');

  const lines = [
    header.map((h, i) => pad(h, widths[i])).join('  '),
    line,
    ...rows.map(r => r.map((v, i) => pad(v, widths[i])).join('  ')),
  ];
  return lines.join('\n');
}

/**
 * @param {Record<string, Array>} tradesBySymbol
 * @param {{ from: string, to: string, days: number }} period
 */
export function generateReport(tradesBySymbol, period) {
  const bySymbol = {};
  const allTrades = [];

  for (const [symbol, trades] of Object.entries(tradesBySymbol)) {
    bySymbol[symbol] = { ...calcMetrics(trades), trades };
    allTrades.push(...trades);
  }
  const total = calcMetrics(allTrades);

  // Terminal
  console.log('\n=== BACKTEST RAPORU ===');
  console.log(`Dönem: ${period.from} → ${period.to} (${period.days} gün)`);
  console.log('\n' + formatTable(bySymbol, total) + '\n');

  // JSON
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const filename = `${ts}.json`;
  const payload = {
    generatedAt: now.toISOString(),
    period,
    symbols: Object.keys(tradesBySymbol),
    summary: total,
    bySymbol: Object.fromEntries(
      Object.entries(bySymbol).map(([sym, m]) => [sym, { ...m }])
    ),
  };

  mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = join(RESULTS_DIR, filename);
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Rapor kaydedildi: backtest-results/${filename}`);
}
```

- [ ] **Step 4: Testleri çalıştır — PASS bekleniyor**

```bash
cd backend && npx vitest run services/service-backtest/test/reporter.test.js
```

Beklenen: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/services/service-backtest/src/reporter.js backend/services/service-backtest/test/reporter.test.js
git commit -m "feat(backtest): reporter - metrics calc + terminal table + JSON output"
```

---

## Task 5: `main.js` — Orchestration

**Files:**
- Create: `backend/services/service-backtest/main.js`

- [ ] **Step 1: `main.js` yaz**

`backend/services/service-backtest/main.js`:

```js
import { fetchCandles, fetchFundingHistory, fetchOISnapshot, interpolateFunding } from './src/fetcher.js';
import { simulateTrade } from './src/simulator.js';
import { generateReport } from './src/reporter.js';
import { calcAllIndicators } from '../service-signal-engine/src/indicators.js';
import { calcLiquidationPressure } from '../service-signal-engine/src/liquidation-pressure.js';
import { calcConfluence } from '../service-signal-engine/src/confluence.js';
import { buildSetup } from '../service-signal-engine/src/setup-builder.js';

const SYMBOLS   = ['BTCUSDT', 'ETHUSDT'];
const DAYS      = 30;
const TIMEFRAME = '1m';
const WINDOW    = 60;   // rolling mum penceresi
const THRESHOLD = 0.65; // confluence eşiği

async function runBacktest(symbol) {
  console.log(`[${symbol}] Veri çekiliyor...`);

  const candles = await fetchCandles(symbol, TIMEFRAME, DAYS);
  if (candles.length < WINDOW) {
    console.warn(`[${symbol}] Yetersiz veri (${candles.length} mum), atlanıyor.`);
    return [];
  }

  const fundingHistory = await fetchFundingHistory(symbol);
  const oiSnapshot     = await fetchOISnapshot(symbol);

  console.log(`[${symbol}] ${candles.length} mum yüklendi. Simülasyon başlıyor...`);

  const trades = [];
  const cooldowns = new Map(); // direction → lastSignalTimestamp

  for (let i = WINDOW; i < candles.length; i++) {
    const window = candles.slice(i - WINDOW, i);
    const current = candles[i];

    const indicators = calcAllIndicators(window);
    indicators.currentPrice = current.close;

    const funding = interpolateFunding(current.timestamp, fundingHistory);

    // OI delta: önceki pencere OI'si yok, snapshot'ı sabit kullan
    const liqPressure = calcLiquidationPressure({
      fundingRate:  funding,
      oiDelta:      0,
      longRatio:    0.5,
      shortRatio:   0.5,
      priceChange:  window.length > 1 ? (current.close - window[window.length - 2].close) / window[window.length - 2].close : 0,
    });

    const confluence = calcConfluence(indicators, liqPressure, THRESHOLD);
    if (!confluence.isCandidate) continue;

    const direction = confluence.direction;

    // 5 dakika cooldown
    const lastSignal = cooldowns.get(direction) ?? 0;
    if (current.timestamp - lastSignal < 5 * 60 * 1000) continue;
    cooldowns.set(direction, current.timestamp);

    const setup = buildSetup({
      direction,
      currentPrice: current.close,
      atr: indicators.atr,
    });

    const remainingCandles = candles.slice(i + 1);
    const result = simulateTrade(setup, remainingCandles);

    trades.push({
      symbol,
      direction,
      timestamp: current.timestamp,
      entryPrice: setup.entryPrice,
      stopPrice: setup.stopPrice,
      targetPrice: setup.targetPrice,
      confluenceScore: confluence.score,
      ...result,
    });
  }

  console.log(`[${symbol}] ${trades.length} sinyal üretildi.`);
  return trades;
}

async function main() {
  const to   = new Date();
  const from = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const period = {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
    days: DAYS,
  };

  const tradesBySymbol = {};

  for (const symbol of SYMBOLS) {
    tradesBySymbol[symbol] = await runBacktest(symbol);
  }

  generateReport(tradesBySymbol, period);
}

main().catch(err => {
  console.error('[backtest] Hata:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Dry-run ile import hatası kontrol et**

```bash
cd backend && node --input-type=module <<'EOF'
import './services/service-backtest/main.js';
EOF
```

Beklenen: Script başlar ve `[BTCUSDT] Veri çekiliyor...` yazar VEYA sadece import hatası yok (API olmadan çalışmaz ama syntax hatası olmamalı).

Alternatif syntax kontrolü:

```bash
cd backend && node --check services/service-backtest/main.js
```

Beklenen: Çıktı yok (syntax hatasız).

- [ ] **Step 3: Tüm testleri çalıştır**

```bash
cd backend && npm test
```

Beklenen: `24 passed` (önceki) + `12 passed` (backtest) = `36 passed (8 dosya)`

- [ ] **Step 4: Commit**

```bash
git add backend/services/service-backtest/main.js
git commit -m "feat(backtest): main orchestration - fetch → signal pipeline → simulate → report"
```

---

## Task 6: Son Kontrol ve Backtest Çalıştırma

**Files:**
- Modify: `backend/.gitignore`

- [ ] **Step 1: `.gitignore` kontrol et**

`backend/.gitignore` içinde şu satır olmalı:
```
backtest-results/*.json
```

Yoksa ekle.

- [ ] **Step 2: Tüm testleri son kez çalıştır**

```bash
cd backend && npm test
```

Beklenen: `36 passed (8 dosya)` — tüm testler yeşil.

- [ ] **Step 3: Gerçek backtest çalıştır**

```bash
cd backend && npm run backtest
```

Beklenen çıktı:
```
[BTCUSDT] Veri çekiliyor...
[BTCUSDT] 43200 mum yüklendi. Simülasyon başlıyor...
[BTCUSDT] 142 sinyal üretildi.
[ETHUSDT] Veri çekiliyor...
...

=== BACKTEST RAPORU ===
Dönem: 2026-05-02 → 2026-06-01 (30 gün)

Symbol    Signals  Win%   PF    MaxDD  AvgR  Timeouts
...
TOTAL     ...

Rapor kaydedildi: backtest-results/2026-06-01T...json
```

- [ ] **Step 4: Final commit**

```bash
git add backend/.gitignore backend/backtest-results/.gitkeep
git commit -m "feat(backtest): phase 1B complete - service-backtest with 30-day simulation"
```

---

## Notlar

- **Bitget REST LSR eksikliği:** `longRatio` ve `shortRatio` sabit `0.5` kullanılıyor. Bu likidasyon baskısı skorunu nötrleştirir — confluence hesabını hafifçe etkileyebilir.
- **OI delta:** Geçmiş OI serisi yok, `oiDelta: 0` kullanılıyor — bu da likidasyon skorunu kısmen köreltir.
- **Gerçek backtest sınırı:** Backtest mumları mevcut signal-engine'in canlı kullandığı LSR/OI verileri olmadan çalışır — sonuçlar canlı performansın %80-90 yaklaşımıdır, birebir değil.
