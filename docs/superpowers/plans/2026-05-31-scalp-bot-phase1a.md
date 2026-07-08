# Scalp Bot — Faz 1A: Altyapı + Market Data + Signal Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bitget'ten gerçek zamanlı market verisi çeken, indikatör + likidasyon baskısı hesaplayan ve aday scalp kurulumlarını Postgres'e kaydeden çalışan bir sistem kurmak.

**Architecture:** Node.js monorepo (tropiq deseni) — `packages/modules/` paylaşılan altyapı, `services/service-market-data/` Bitget WebSocket verisi toplar Redis'e yayar, `services/service-signal-engine/` Redis'ten okur indikatör + confluence skoru hesaplar aday kurulum bulunca Postgres'e yazar. Her servis `service-discovery` ile Redis'e kaydolur.

**Tech Stack:** Node.js ≥20 ESM, Express, Redis (ioredis), PostgreSQL (pg), `bitget-api` npm (tiagosiebler/bitget-api), `technicalindicators` npm, `node-telegram-bot-api`, Docker Compose (geliştirme Postgres+Redis için), Vitest (unit test).

---

## Faz Dışı (bu planda YOK)
- ai-service (Python/Ollama) — ayrı plan
- service-backtest — ayrı plan
- service-notifier, service-tracker — ayrı plan
- gateway, web-panel — ayrı plan

---

## Dosya Yapısı

```
borsa-bot/
├── package.json                          # kök — workspaces, ortak devDeps
├── .env.example                          # tüm env değişken şablonu
├── docker-compose.yml                    # Postgres + Redis (geliştirme)
├── db-schemas/
│   ├── 00-init.sql                       # extension, enum'lar
│   ├── 01-config-watchlist.sql           # config, watchlist tabloları
│   └── 02-signals.sql                   # signals, signal_outcomes tabloları
├── packages/modules/
│   ├── config/
│   │   └── index.js                      # 12factor-config yükleyici
│   ├── datasource/
│   │   ├── index.js                      # createDatasources factory
│   │   └── connectors/
│   │       ├── redis.js                  # ioredis bağlantısı
│   │       └── postgre.js                # pg Pool bağlantısı
│   ├── helper/
│   │   └── index.js                      # log, exitOnError, appStarted
│   └── service-discovery/
│       └── index.js                      # Redis'e servis kaydı + heartbeat
├── services/
│   ├── service-market-data/
│   │   ├── package.json
│   │   ├── main.js                       # Express app + WS başlatma
│   │   ├── configs/
│   │   │   ├── app-config.js             # port, env
│   │   │   └── datasource-config.js      # redis bağlantı isimleri
│   │   ├── src/
│   │   │   ├── bitget-ws.js              # Bitget WS bağlantısı + kanallar
│   │   │   ├── candle-aggregator.js      # ham tick'lerden mum oluşturma
│   │   │   └── publisher.js              # Redis pub/sub yayını
│   │   └── test/
│   │       └── unit/
│   │           ├── candle-aggregator.test.js
│   │           └── publisher.test.js
│   └── service-signal-engine/
│       ├── package.json
│       ├── main.js                       # Express app + engine başlatma
│       ├── configs/
│       │   ├── app-config.js
│       │   └── datasource-config.js
│       ├── src/
│       │   ├── subscriber.js             # Redis'ten mum/OI/funding okuma
│       │   ├── indicators.js             # EMA, RSI, MACD, BB, ATR, VWAP hesaplama
│       │   ├── liquidation-pressure.js   # OI delta + funding + L/S oranı → baskı skoru
│       │   ├── confluence.js             # multi-timeframe skor + eşik → aday kurulum
│       │   ├── setup-builder.js          # ATR-tabanlı giriş/stop/hedef üretimi
│       │   └── signal-repository.js      # Postgres'e sinyal yazma
│       └── test/
│           └── unit/
│               ├── indicators.test.js
│               ├── liquidation-pressure.test.js
│               ├── confluence.test.js
│               └── setup-builder.test.js
```

---

## Task 1: Monorepo Kökü + Docker Compose

**Files:**
- Create: `borsa-bot/package.json`
- Create: `borsa-bot/.env.example`
- Create: `borsa-bot/docker-compose.yml`
- Create: `borsa-bot/.gitignore`

- [ ] **Step 1.1: Kök dizini oluştur ve package.json yaz**

```bash
mkdir -p ~/developer/fullStack/borsa-bot && cd ~/developer/fullStack/borsa-bot
```

`borsa-bot/package.json`:
```json
{
  "name": "borsa-bot",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "workspaces": [
    "packages/modules/*",
    "services/*"
  ],
  "scripts": {
    "test": "vitest run",
    "test:market-data": "vitest run services/service-market-data",
    "test:signal-engine": "vitest run services/service-signal-engine",
    "db:migrate": "psql $DATABASE_URL -f db-schemas/00-init.sql -f db-schemas/01-config-watchlist.sql -f db-schemas/02-signals.sql",
    "dev:market-data": "node services/service-market-data/main.js",
    "dev:signal-engine": "node services/service-signal-engine/main.js"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 1.2: .env.example yaz**

`borsa-bot/.env.example`:
```bash
# Node
NODE_ENV=development

# Postgres
DATABASE_URL=postgres://botuser:botpass@localhost:5432/borsabot

# Redis
CORE_REDIS_URL=redis://localhost:6379
CORE_DISCOVERY_REDIS_URL=redis://localhost:6379

# Service ports
MARKET_DATA_PORT=3101
SIGNAL_ENGINE_PORT=3102

# Bitget (sadece public WS için API key gerekmez, ama REST backtest için gerekir)
BITGET_API_KEY=
BITGET_SECRET_KEY=
BITGET_PASSPHRASE=

# Telegram (service-notifier için — şimdi boş)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

- [ ] **Step 1.3: .gitignore yaz**

`borsa-bot/.gitignore`:
```
node_modules/
.env
dist/
*.log
.DS_Store
```

- [ ] **Step 1.4: docker-compose.yml yaz**

`borsa-bot/docker-compose.yml`:
```yaml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: borsabot
      POSTGRES_USER: botuser
      POSTGRES_PASSWORD: botpass
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
volumes:
  pgdata:
```

- [ ] **Step 1.5: Docker başlat ve bağlantıyı doğrula**

```bash
cd ~/developer/fullStack/borsa-bot
docker compose up -d
sleep 3
docker compose ps
```

Beklenen çıktı: Her iki servis de `running` durumunda.

```bash
psql postgres://botuser:botpass@localhost:5432/borsabot -c "\l"
redis-cli -u redis://localhost:6379 ping
```

Beklenen: psql veritabanı listesi, redis `PONG`.

- [ ] **Step 1.6: Commit**

```bash
cd ~/developer/fullStack/borsa-bot
git init
git add package.json .env.example docker-compose.yml .gitignore
git commit -m "chore: monorepo root + docker compose (postgres + redis)"
```

---

## Task 2: DB Şemaları

**Files:**
- Create: `borsa-bot/db-schemas/00-init.sql`
- Create: `borsa-bot/db-schemas/01-config-watchlist.sql`
- Create: `borsa-bot/db-schemas/02-signals.sql`

- [ ] **Step 2.1: 00-init.sql yaz**

`borsa-bot/db-schemas/00-init.sql`:
```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE signal_direction AS ENUM ('long', 'short');
CREATE TYPE signal_status AS ENUM ('pending', 'active', 'tp_hit', 'sl_hit', 'timeout', 'cancelled');
CREATE TYPE timeframe AS ENUM ('1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d');
```

- [ ] **Step 2.2: 01-config-watchlist.sql yaz**

`borsa-bot/db-schemas/01-config-watchlist.sql`:
```sql
CREATE TABLE IF NOT EXISTS watchlist (
  id          SERIAL PRIMARY KEY,
  symbol      VARCHAR(20) NOT NULL UNIQUE,  -- örn. 'BTCUSDT'
  active      BOOLEAN NOT NULL DEFAULT true,
  timeframes  TEXT[] NOT NULL DEFAULT '{1m,5m,15m}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bot_config (
  key         VARCHAR(100) PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Varsayılan ayarlar
INSERT INTO watchlist (symbol) VALUES ('BTCUSDT'), ('ETHUSDT')
ON CONFLICT (symbol) DO NOTHING;

INSERT INTO bot_config (key, value) VALUES
  ('confluence_threshold', '0.65'),
  ('ai_confidence_threshold', '0.70'),
  ('ai_enabled', 'true'),
  ('ai_cooldown_seconds', '30'),
  ('rr_min', '1.5')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2.3: 02-signals.sql yaz**

`borsa-bot/db-schemas/02-signals.sql`:
```sql
CREATE TABLE IF NOT EXISTS signals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol              VARCHAR(20) NOT NULL,
  direction           signal_direction NOT NULL,
  trigger_timeframe   timeframe NOT NULL,
  entry_price         NUMERIC(20, 8) NOT NULL,
  stop_price          NUMERIC(20, 8) NOT NULL,
  target_price        NUMERIC(20, 8) NOT NULL,
  rr_ratio            NUMERIC(6, 3) NOT NULL,
  confluence_score    NUMERIC(5, 4) NOT NULL,
  ai_approved         BOOLEAN,
  ai_confidence       NUMERIC(5, 4),
  ai_reason           TEXT,
  indicators_snapshot JSONB NOT NULL,   -- EMA, RSI, MACD vb. o anki değerler
  liq_pressure_score  NUMERIC(5, 4),    -- 0..1 likidasyon baskısı
  liq_direction       signal_direction, -- baskının yönü
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signal_outcomes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id       UUID NOT NULL REFERENCES signals(id),
  status          signal_status NOT NULL DEFAULT 'pending',
  exit_price      NUMERIC(20, 8),
  pnl_r           NUMERIC(8, 4),  -- R cinsinden kâr/zarar (1R = stop mesafesi)
  resolved_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_signals_symbol_created ON signals(symbol, created_at DESC);
CREATE INDEX idx_outcomes_signal_id ON signal_outcomes(signal_id);
CREATE INDEX idx_outcomes_status ON signal_outcomes(status);
```

- [ ] **Step 2.4: Migration çalıştır ve doğrula**

```bash
cd ~/developer/fullStack/borsa-bot
cp .env.example .env
# .env dosyasında DATABASE_URL satırını düzenle: postgres://botuser:botpass@localhost:5432/borsabot

export DATABASE_URL=postgres://botuser:botpass@localhost:5432/borsabot
npm run db:migrate
```

Beklenen: SQL komutları hatasız çalışır.

```bash
psql $DATABASE_URL -c "\dt"
```

Beklenen: `watchlist`, `bot_config`, `signals`, `signal_outcomes` tablolarını listeler.

```bash
psql $DATABASE_URL -c "SELECT symbol FROM watchlist;"
```

Beklenen: BTCUSDT ve ETHUSDT satırları.

- [ ] **Step 2.5: Commit**

```bash
git add db-schemas/
git commit -m "feat: postgres schema (signals, watchlist, config, outcomes)"
```

---

## Task 3: packages/modules — Config ve Helper

**Files:**
- Create: `borsa-bot/packages/modules/config/package.json`
- Create: `borsa-bot/packages/modules/config/index.js`
- Create: `borsa-bot/packages/modules/helper/package.json`
- Create: `borsa-bot/packages/modules/helper/index.js`

- [ ] **Step 3.1: config module oluştur**

`borsa-bot/packages/modules/config/package.json`:
```json
{
  "name": "@borsa-bot/config",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js"
}
```

`borsa-bot/packages/modules/config/index.js`:
```js
// 12factor tarzı config yükleyici.
// Her alan: { default?, env?, type? }. env varsa ortam değişkeni önceliklidir.

function loadConfig(schema) {
  const result = {};
  for (const [key, def] of Object.entries(schema)) {
    let value = def.default;
    if (def.env && process.env[def.env] !== undefined) {
      value = process.env[def.env];
    }
    if (value === undefined) {
      throw new Error(`Config eksik: ${key} (env: ${def.env ?? 'yok'})`);
    }
    if (def.type === 'number') value = Number(value);
    if (def.type === 'boolean') value = value === 'true' || value === true;
    if (def.type === 'enum' && !def.values.includes(value)) {
      throw new Error(`Config geçersiz değer: ${key}=${value}, beklenen: ${def.values}`);
    }
    result[key] = value;
  }
  return result;
}

export default loadConfig;
```

- [ ] **Step 3.2: helper module oluştur**

`borsa-bot/packages/modules/helper/package.json`:
```json
{
  "name": "@borsa-bot/helper",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js"
}
```

`borsa-bot/packages/modules/helper/index.js`:
```js
function timestamp() {
  return new Date().toISOString();
}

const log = {
  info:  (...args) => console.log(`[${timestamp()}] INFO `, ...args),
  warn:  (...args) => console.warn(`[${timestamp()}] WARN `, ...args),
  error: (...args) => console.error(`[${timestamp()}] ERROR`, ...args),
  debug: (...args) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[${timestamp()}] DEBUG`, ...args);
    }
  },
};

function exitOnError(error) {
  if (error) log.error('Kritik hata, servis durduruluyor:', error);
  process.exit(1);
}

function appStarted(config) {
  log.info(`Servis hazır — port: ${config.port}, env: ${config.nodeEnv}`);
}

export default { log, exitOnError, appStarted };
```

- [ ] **Step 3.3: Commit**

```bash
git add packages/modules/config/ packages/modules/helper/
git commit -m "feat: packages/modules config + helper"
```

---

## Task 4: packages/modules — Datasource (Redis + Postgres)

**Files:**
- Create: `borsa-bot/packages/modules/datasource/package.json`
- Create: `borsa-bot/packages/modules/datasource/index.js`
- Create: `borsa-bot/packages/modules/datasource/connectors/redis.js`
- Create: `borsa-bot/packages/modules/datasource/connectors/postgre.js`

- [ ] **Step 4.1: Bağımlılıkları yükle**

`borsa-bot/packages/modules/datasource/package.json`:
```json
{
  "name": "@borsa-bot/datasource",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "dependencies": {
    "ioredis": "^5.3.2",
    "pg": "^8.11.0"
  }
}
```

```bash
cd ~/developer/fullStack/borsa-bot/packages/modules/datasource
npm install
```

- [ ] **Step 4.2: Redis connector yaz**

`borsa-bot/packages/modules/datasource/connectors/redis.js`:
```js
import Redis from 'ioredis';
import helper from '../../helper/index.js';

export function createRedisConnection(url, db = 0) {
  const client = new Redis(url, {
    db,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 15000);
      helper.log.warn(`Redis bağlantı denemesi #${times}, ${delay}ms sonra tekrar...`);
      return delay;
    },
    maxRetriesPerRequest: 3,
  });

  client.on('connect', () => helper.log.info('Redis bağlandı:', url));
  client.on('error', (err) => helper.log.error('Redis hatası:', err.message));
  return client;
}
```

- [ ] **Step 4.3: Postgres connector yaz**

`borsa-bot/packages/modules/datasource/connectors/postgre.js`:
```js
import pg from 'pg';
import helper from '../../helper/index.js';

const { Pool } = pg;

export function createPostgresPool(url) {
  const pool = new Pool({ connectionString: url, max: 10 });
  pool.on('error', (err) => helper.log.error('Postgres pool hatası:', err.message));
  helper.log.info('Postgres pool oluşturuldu');
  return pool;
}
```

- [ ] **Step 4.4: Datasource factory yaz**

`borsa-bot/packages/modules/datasource/index.js`:
```js
import { createRedisConnection } from './connectors/redis.js';
import { createPostgresPool } from './connectors/postgre.js';

// datasources singleton — servis kodundan `datasources.coreRedis` gibi erişilir
const datasources = {};

export async function createDatasources(config) {
  datasources.coreRedis = createRedisConnection(config.coreRedisUrl);
  datasources.discoveryRedis = createRedisConnection(config.discoveryRedisUrl);
  datasources.postgres = createPostgresPool(config.databaseUrl);

  // Postgres bağlantısını doğrula
  const client = await datasources.postgres.connect();
  await client.query('SELECT 1');
  client.release();

  return datasources;
}

export default datasources;
```

- [ ] **Step 4.5: Commit**

```bash
git add packages/modules/datasource/
git commit -m "feat: packages/modules datasource (redis + postgres connectors)"
```

---

## Task 5: packages/modules — Service Discovery

**Files:**
- Create: `borsa-bot/packages/modules/service-discovery/package.json`
- Create: `borsa-bot/packages/modules/service-discovery/index.js`

- [ ] **Step 5.1: Service discovery yaz**

`borsa-bot/packages/modules/service-discovery/package.json`:
```json
{
  "name": "@borsa-bot/service-discovery",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js"
}
```

`borsa-bot/packages/modules/service-discovery/index.js`:
```js
import helper from '../helper/index.js';

const HEARTBEAT_INTERVAL_MS = 3000;
const SERVICE_TTL_S = 10;

// serviceName: 'service-market-data', meta: { port, version }
export function createServiceDiscovery(redisClient, serviceName, meta = {}) {
  const key = `service:${serviceName}`;

  async function register() {
    const data = {
      name: serviceName,
      ...meta,
      registeredAt: Date.now(),
    };
    await redisClient.setex(key, SERVICE_TTL_S, JSON.stringify(data));
    helper.log.info(`Service-discovery: ${serviceName} kaydedildi`);
  }

  function startHeartbeat() {
    // Her 3 saniyede TTL'i yenile (alive sinyali)
    const interval = setInterval(async () => {
      try {
        await redisClient.expire(key, SERVICE_TTL_S);
      } catch (err) {
        helper.log.warn('Heartbeat hatası:', err.message);
      }
    }, HEARTBEAT_INTERVAL_MS);
    interval.unref(); // process'i bekletme
    return interval;
  }

  async function discover(name) {
    const raw = await redisClient.get(`service:${name}`);
    return raw ? JSON.parse(raw) : null;
  }

  return { register, startHeartbeat, discover };
}
```

- [ ] **Step 5.2: Commit**

```bash
git add packages/modules/service-discovery/
git commit -m "feat: packages/modules service-discovery (redis heartbeat)"
```

---

## Task 6: service-market-data — İskelet + Config

**Files:**
- Create: `borsa-bot/services/service-market-data/package.json`
- Create: `borsa-bot/services/service-market-data/configs/app-config.js`
- Create: `borsa-bot/services/service-market-data/configs/datasource-config.js`
- Create: `borsa-bot/services/service-market-data/main.js`

- [ ] **Step 6.1: package.json ve bağımlılıklar**

`borsa-bot/services/service-market-data/package.json`:
```json
{
  "name": "@borsa-bot/service-market-data",
  "version": "1.0.0",
  "type": "module",
  "main": "main.js",
  "scripts": {
    "start": "node main.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@borsa-bot/config": "*",
    "@borsa-bot/datasource": "*",
    "@borsa-bot/helper": "*",
    "@borsa-bot/service-discovery": "*",
    "bitget-api": "^2.0.0",
    "express": "^4.18.0"
  }
}
```

```bash
cd ~/developer/fullStack/borsa-bot
npm install
```

- [ ] **Step 6.2: app-config.js yaz**

`borsa-bot/services/service-market-data/configs/app-config.js`:
```js
export default {
  port:       { default: 3101, env: 'MARKET_DATA_PORT', type: 'number' },
  nodeEnv:    { default: 'development', env: 'NODE_ENV', type: 'enum', values: ['development', 'production', 'test'] },
  databaseUrl:        { env: 'DATABASE_URL' },
  coreRedisUrl:       { default: 'redis://localhost:6379', env: 'CORE_REDIS_URL' },
  discoveryRedisUrl:  { default: 'redis://localhost:6379', env: 'CORE_DISCOVERY_REDIS_URL' },
};
```

- [ ] **Step 6.3: main.js iskeleti yaz**

`borsa-bot/services/service-market-data/main.js`:
```js
import express from 'express';
import loadConfig from '@borsa-bot/config';
import { createDatasources } from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { createServiceDiscovery } from '@borsa-bot/service-discovery';
import appConfigSchema from './configs/app-config.js';
import { startBitgetWS } from './src/bitget-ws.js';

async function initialize() {
  const config = loadConfig(appConfigSchema);
  const app = express();

  await createDatasources(config).catch((err) => {
    helper.exitOnError(err);
  });

  const sd = createServiceDiscovery(
    (await import('@borsa-bot/datasource')).default.discoveryRedis,
    'service-market-data',
    { port: config.port, version: '1.0.0' },
  );
  await sd.register();
  sd.startHeartbeat();

  // Health check
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'service-market-data' }));
  app.listen(config.port, () => helper.appStarted(config));

  // Bitget WS başlat
  await startBitgetWS();
}

initialize().catch(helper.exitOnError);
```

- [ ] **Step 6.4: Commit**

```bash
git add services/service-market-data/
git commit -m "feat: service-market-data skeleton + config"
```

---

## Task 7: service-market-data — Bitget WebSocket

**Files:**
- Create: `borsa-bot/services/service-market-data/src/bitget-ws.js`
- Create: `borsa-bot/services/service-market-data/src/publisher.js`

- [ ] **Step 7.1: publisher.js yaz (test önce)**

Önce test:

`borsa-bot/services/service-market-data/test/unit/publisher.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPublisher } from '../../src/publisher.js';

describe('publisher', () => {
  let fakeRedis;
  let publisher;

  beforeEach(() => {
    fakeRedis = { publish: vi.fn().mockResolvedValue(1) };
    publisher = createPublisher(fakeRedis);
  });

  it('kanalı doğru formatta yayınlar: md.{symbol}.{tf}', async () => {
    const candle = { open: 1, high: 2, low: 0.9, close: 1.5, volume: 100, ts: 1000 };
    await publisher.publishCandle('BTCUSDT', '1m', candle);

    expect(fakeRedis.publish).toHaveBeenCalledWith(
      'md.BTCUSDT.1m',
      JSON.stringify({ type: 'candle', symbol: 'BTCUSDT', tf: '1m', data: candle }),
    );
  });

  it('funding rate yayınlar: md.{symbol}.funding', async () => {
    await publisher.publishFunding('BTCUSDT', { rate: 0.0001, nextTs: 9999 });
    expect(fakeRedis.publish).toHaveBeenCalledWith(
      'md.BTCUSDT.funding',
      expect.stringContaining('"type":"funding"'),
    );
  });

  it('open interest yayınlar: md.{symbol}.oi', async () => {
    await publisher.publishOI('BTCUSDT', { oi: 50000, oiDelta: 500 });
    expect(fakeRedis.publish).toHaveBeenCalledWith(
      'md.BTCUSDT.oi',
      expect.stringContaining('"type":"oi"'),
    );
  });
});
```

- [ ] **Step 7.2: Testi çalıştır — FAIL bekliyoruz**

```bash
cd ~/developer/fullStack/borsa-bot
npm run test:market-data
```

Beklenen: `Cannot find module '../../src/publisher.js'` hatası.

- [ ] **Step 7.3: publisher.js yaz**

`borsa-bot/services/service-market-data/src/publisher.js`:
```js
import datasources from '@borsa-bot/datasource';

export function createPublisher(redisOverride) {
  const redis = redisOverride ?? datasources.coreRedis;

  async function publishCandle(symbol, tf, candle) {
    const channel = `md.${symbol}.${tf}`;
    const payload = JSON.stringify({ type: 'candle', symbol, tf, data: candle });
    await redis.publish(channel, payload);
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

- [ ] **Step 7.4: Testleri çalıştır — PASS bekliyoruz**

```bash
npm run test:market-data
```

Beklenen: 3 test PASS.

- [ ] **Step 7.5: bitget-ws.js yaz**

`borsa-bot/services/service-market-data/src/bitget-ws.js`:
```js
import { WebsocketClientV3 } from 'bitget-api';
import helper from '@borsa-bot/helper';
import { createPublisher } from './publisher.js';

// Takip edilecek semboller ve timeframe'ler
const SYMBOLS = ['BTCUSDT', 'ETHUSDT'];
const TIMEFRAMES = ['1m', '5m', '15m'];

// Bitget TF kodu → bizim iç koda dönüşüm
const TF_MAP = { '1m': '1m', '5m': '5m', '15m': '15m' };

export async function startBitgetWS() {
  const publisher = createPublisher();

  const ws = new WebsocketClientV3({
    // Public WS için API key gerekmez
  });

  ws.on('update', async (data) => {
    try {
      await handleUpdate(data, publisher);
    } catch (err) {
      helper.log.error('WS update işleme hatası:', err.message);
    }
  });

  ws.on('error', (err) => helper.log.error('Bitget WS hatası:', err));
  ws.on('reconnect', () => helper.log.info('Bitget WS yeniden bağlanıyor...'));
  ws.on('reconnected', () => {
    helper.log.info('Bitget WS yeniden bağlandı, kanallar yeniden abone oluyor...');
    subscribeAll(ws);
  });

  ws.on('open', () => {
    helper.log.info('Bitget WS bağlandı');
    subscribeAll(ws);
  });

  // WS bağlantısını başlat
  ws.connectPublic();
}

function subscribeAll(ws) {
  for (const symbol of SYMBOLS) {
    for (const tf of TIMEFRAMES) {
      // Mum verisi
      ws.subscribeTopic('UMCBL', `candle${tf}`, symbol);
    }
    // Funding rate, OI, Long/Short ratio (public kanallar)
    ws.subscribeTopic('UMCBL', 'funding-rate', symbol);
    ws.subscribeTopic('UMCBL', 'open-interest', symbol);
    ws.subscribeTopic('UMCBL', 'account-ratio', symbol);
  }
}

async function handleUpdate(event, publisher) {
  const { arg, data } = event;
  if (!arg || !data) return;

  const { channel, instId: symbol } = arg;
  if (!symbol) return;

  if (channel.startsWith('candle')) {
    const tf = channel.replace('candle', '');
    if (!TF_MAP[tf]) return;
    for (const d of data) {
      // Bitget mum formatı: [ts, open, high, low, close, volume, quoteVolume]
      const candle = {
        ts:     Number(d[0]),
        open:   parseFloat(d[1]),
        high:   parseFloat(d[2]),
        low:    parseFloat(d[3]),
        close:  parseFloat(d[4]),
        volume: parseFloat(d[5]),
      };
      await publisher.publishCandle(symbol, TF_MAP[tf], candle);
    }
    return;
  }

  if (channel === 'funding-rate') {
    for (const d of data) {
      await publisher.publishFunding(symbol, {
        rate:   parseFloat(d.fundingRate ?? d.rate ?? 0),
        nextTs: Number(d.nextFundingTime ?? 0),
      });
    }
    return;
  }

  if (channel === 'open-interest') {
    for (const d of data) {
      await publisher.publishOI(symbol, {
        oi: parseFloat(d.holdingAmount ?? d.oi ?? 0),
      });
    }
    return;
  }

  if (channel === 'account-ratio') {
    for (const d of data) {
      await publisher.publishLongShortRatio(symbol, {
        longRatio:  parseFloat(d.longRatio ?? d.buyRatio ?? 0),
        shortRatio: parseFloat(d.shortRatio ?? d.sellRatio ?? 0),
      });
    }
  }
}
```

- [ ] **Step 7.6: Canlı WS testi (manuel)**

```bash
# Terminal 1: Redis kanallarını izle
redis-cli -u redis://localhost:6379 SUBSCRIBE "md.BTCUSDT.1m" "md.BTCUSDT.funding" "md.BTCUSDT.oi"

# Terminal 2: Servisi başlat
cd ~/developer/fullStack/borsa-bot
npm run dev:market-data
```

Beklenen: Terminal 1'de birkaç saniye içinde JSON mum mesajları görünmeye başlar.

- [ ] **Step 7.7: Commit**

```bash
git add services/service-market-data/src/ services/service-market-data/test/
git commit -m "feat: bitget WS candle/funding/OI/LSR publisher (Redis pub/sub)"
```

---

## Task 8: service-signal-engine — İndikatörler

**Files:**
- Create: `borsa-bot/services/service-signal-engine/package.json`
- Create: `borsa-bot/services/service-signal-engine/src/indicators.js`
- Create: `borsa-bot/services/service-signal-engine/test/unit/indicators.test.js`

- [ ] **Step 8.1: package.json ve bağımlılıklar**

`borsa-bot/services/service-signal-engine/package.json`:
```json
{
  "name": "@borsa-bot/service-signal-engine",
  "version": "1.0.0",
  "type": "module",
  "main": "main.js",
  "scripts": {
    "start": "node main.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@borsa-bot/config": "*",
    "@borsa-bot/datasource": "*",
    "@borsa-bot/helper": "*",
    "@borsa-bot/service-discovery": "*",
    "technicalindicators": "^3.1.0",
    "express": "^4.18.0"
  }
}
```

```bash
cd ~/developer/fullStack/borsa-bot && npm install
```

- [ ] **Step 8.2: indicators.test.js yaz (TDD)**

`borsa-bot/services/service-signal-engine/test/unit/indicators.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { calcEMA, calcRSI, calcBollingerBands, calcATR, calcMACD, calcVWAP } from '../../src/indicators.js';

// 20 mumdan oluşan test verisi — sabit kapanış değerleri
const closes20 = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109,
                  110, 112, 111, 113, 115, 114, 116, 118, 117, 119];
const highs20  = closes20.map(c => c + 1);
const lows20   = closes20.map(c => c - 1);
const volumes20 = closes20.map(() => 1000);

describe('calcEMA', () => {
  it('EMA 9 sonuç döner ve son değer giriş aralığında', () => {
    const result = calcEMA(closes20, 9);
    expect(result.length).toBeGreaterThan(0);
    const last = result[result.length - 1];
    expect(last).toBeGreaterThan(100);
    expect(last).toBeLessThan(125);
  });

  it('yeterli veri yoksa boş dizi döner', () => {
    expect(calcEMA([100, 101], 9)).toEqual([]);
  });
});

describe('calcRSI', () => {
  it('RSI 0–100 arasında', () => {
    const result = calcRSI(closes20, 14);
    expect(result.length).toBeGreaterThan(0);
    const last = result[result.length - 1];
    expect(last).toBeGreaterThanOrEqual(0);
    expect(last).toBeLessThanOrEqual(100);
  });

  it('sürekli yükselen seri yüksek RSI üretir (>60)', () => {
    const rising = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
    const result = calcRSI(rising, 14);
    expect(result[result.length - 1]).toBeGreaterThan(60);
  });
});

describe('calcBollingerBands', () => {
  it('upper > middle > lower döner', () => {
    const result = calcBollingerBands(closes20, 20, 2);
    expect(result).not.toBeNull();
    expect(result.upper).toBeGreaterThan(result.middle);
    expect(result.middle).toBeGreaterThan(result.lower);
  });
});

describe('calcATR', () => {
  it('ATR pozitif sayı döner', () => {
    const result = calcATR(highs20, lows20, closes20, 14);
    expect(result).toBeGreaterThan(0);
  });
});

describe('calcMACD', () => {
  it('MACD objesi döner: macd, signal, histogram', () => {
    const closes30 = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5 + i);
    const result = calcMACD(closes30);
    expect(result).not.toBeNull();
    expect(typeof result.macd).toBe('number');
    expect(typeof result.signal).toBe('number');
    expect(typeof result.histogram).toBe('number');
  });
});

describe('calcVWAP', () => {
  it('VWAP hacim ortalamalı fiyat aralığında', () => {
    const result = calcVWAP(highs20, lows20, closes20, volumes20);
    expect(result).toBeGreaterThan(99);
    expect(result).toBeLessThan(125);
  });
});
```

- [ ] **Step 8.3: Test çalıştır — FAIL bekliyoruz**

```bash
npm run test:signal-engine
```

Beklenen: `Cannot find module '../../src/indicators.js'`

- [ ] **Step 8.4: indicators.js yaz**

`borsa-bot/services/service-signal-engine/src/indicators.js`:
```js
import TI from 'technicalindicators';

// Dizi son elemanını döner veya null
const last = (arr) => arr?.length ? arr[arr.length - 1] : null;

// EMA — closes: number[], period: number → number[]
export function calcEMA(closes, period) {
  if (closes.length < period) return [];
  const result = TI.EMA.calculate({ period, values: closes });
  return result;
}

// RSI — 0..100 dizi döner
export function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return [];
  return TI.RSI.calculate({ period, values: closes });
}

// Bollinger Bands — son bandı döner: { upper, middle, lower } | null
export function calcBollingerBands(closes, period = 20, stdDev = 2) {
  if (closes.length < period) return null;
  const result = TI.BollingerBands.calculate({ period, stdDev, values: closes });
  return last(result) ?? null;
}

// ATR — son değeri döner (son ATR değeri)
export function calcATR(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return 0;
  const result = TI.ATR.calculate({ period, high: highs, low: lows, close: closes });
  return last(result) ?? 0;
}

// MACD — son değeri döner: { macd, signal, histogram } | null
export function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  if (closes.length < slow + signal) return null;
  const result = TI.MACD.calculate({
    values: closes,
    fastPeriod: fast,
    slowPeriod: slow,
    signalPeriod: signal,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const r = last(result);
  if (!r) return null;
  return { macd: r.MACD, signal: r.signal, histogram: r.histogram };
}

// VWAP — tüm serinin VWAP'ını hesaplar (oturum bazlı değil, pencere bazlı)
export function calcVWAP(highs, lows, closes, volumes) {
  const len = Math.min(highs.length, lows.length, closes.length, volumes.length);
  let cumTP = 0, cumVol = 0;
  for (let i = 0; i < len; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumTP  += tp * volumes[i];
    cumVol += volumes[i];
  }
  return cumVol > 0 ? cumTP / cumVol : closes[len - 1] ?? 0;
}

// Tüm indikatörleri hesaplayıp tek seferde döner — main consumer bunu çağırır
export function calcAllIndicators(candles) {
  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  const ema9  = last(calcEMA(closes, 9))  ?? null;
  const ema21 = last(calcEMA(closes, 21)) ?? null;
  const ema50 = last(calcEMA(closes, 50)) ?? null;
  const rsi   = last(calcRSI(closes, 14)) ?? null;
  const macd  = calcMACD(closes);
  const bb    = calcBollingerBands(closes, 20, 2);
  const atr   = calcATR(highs, lows, closes, 14);
  const vwap  = calcVWAP(highs, lows, closes, volumes);

  return { ema9, ema21, ema50, rsi, macd, bb, atr, vwap };
}
```

- [ ] **Step 8.5: Testleri çalıştır — PASS bekliyoruz**

```bash
npm run test:signal-engine
```

Beklenen: 8 test PASS.

- [ ] **Step 8.6: Commit**

```bash
git add services/service-signal-engine/
git commit -m "feat: signal-engine indicators (EMA/RSI/MACD/BB/ATR/VWAP) with tests"
```

---

## Task 9: service-signal-engine — Likidasyon Baskısı

**Files:**
- Create: `borsa-bot/services/service-signal-engine/src/liquidation-pressure.js`
- Create: `borsa-bot/services/service-signal-engine/test/unit/liquidation-pressure.test.js`

- [ ] **Step 9.1: Test yaz (TDD)**

`borsa-bot/services/service-signal-engine/test/unit/liquidation-pressure.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { calcLiquidationPressure } from '../../src/liquidation-pressure.js';

describe('calcLiquidationPressure', () => {
  it('nötr koşullarda 0.5 civarı skor döner', () => {
    const result = calcLiquidationPressure({
      fundingRate: 0.0001,
      oiDelta: 0,
      longRatio: 0.5,
      shortRatio: 0.5,
      priceChange: 0,
    });
    expect(result.score).toBeGreaterThan(0.35);
    expect(result.score).toBeLessThan(0.65);
  });

  it('aşırı pozitif funding + fazla long → short squeeze riski → direction=short', () => {
    const result = calcLiquidationPressure({
      fundingRate: 0.003,   // aşırı yüksek
      oiDelta: 5000,        // OI artıyor (long açılıyor)
      longRatio: 0.75,      // longlar çoğunlukta
      shortRatio: 0.25,
      priceChange: 0.02,    // fiyat yukarı gidiyor (sıkışma kurulumu)
    });
    expect(result.direction).toBe('short'); // long squeeze baskısı
    expect(result.score).toBeGreaterThan(0.6);
  });

  it('negatif funding + fazla short → long squeeze riski → direction=long', () => {
    const result = calcLiquidationPressure({
      fundingRate: -0.002,
      oiDelta: 4000,
      longRatio: 0.25,
      shortRatio: 0.75,
      priceChange: -0.02,
    });
    expect(result.direction).toBe('long');
    expect(result.score).toBeGreaterThan(0.6);
  });

  it('score her zaman 0..1 arasında', () => {
    const result = calcLiquidationPressure({
      fundingRate: 0.01,
      oiDelta: 100000,
      longRatio: 0.9,
      shortRatio: 0.1,
      priceChange: 0.05,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 9.2: Test çalıştır — FAIL bekliyoruz**

```bash
npm run test:signal-engine
```

Beklenen: `Cannot find module '../../src/liquidation-pressure.js'`

- [ ] **Step 9.3: liquidation-pressure.js yaz**

`borsa-bot/services/service-signal-engine/src/liquidation-pressure.js`:
```js
// Likidasyon baskısı hesaplayıcı.
// Girdi: { fundingRate, oiDelta, longRatio, shortRatio, priceChange }
// Çıktı: { score: 0..1, direction: 'long'|'short'|'neutral', components }

const FUNDING_NORMAL = 0.0001;   // tipik saatlik funding
const FUNDING_EXTREME = 0.003;   // aşırı seviye

function clamp(v, min = 0, max = 1) {
  return Math.min(max, Math.max(min, v));
}

export function calcLiquidationPressure({ fundingRate, oiDelta, longRatio, shortRatio, priceChange }) {
  // 1. Funding baskısı: pozitif aşırı funding → longlar fazla → short squeeze riski
  //    negatif aşırı funding → shortlar fazla → long squeeze riski
  const fundingNorm = clamp((Math.abs(fundingRate) - FUNDING_NORMAL) / (FUNDING_EXTREME - FUNDING_NORMAL));
  const fundingBiasLong = fundingRate < 0;  // negatif funding = short-ağır = long squeeze riski

  // 2. Long/Short dengesizliği (0.5 nötr)
  const imbalance = Math.abs(longRatio - shortRatio);  // 0..1
  const moreShorts = shortRatio > longRatio;

  // 3. OI delta normalleştirilmiş (yüksek + fiyatla aynı yön = momentum squeeze)
  const oiPressure = clamp(Math.abs(oiDelta) / 10000);

  // 4. Fiyat hareketi yönü × OI birleşimi
  const priceOIAlignment = Math.abs(priceChange) > 0.005 ? 0.2 : 0;

  // Toplam skor (ağırlıklı ortalama)
  const rawScore = 0.35 * fundingNorm + 0.30 * imbalance + 0.25 * oiPressure + 0.10 * priceOIAlignment;
  const score = clamp(0.5 + (rawScore - 0.25));  // 0.5 etrafında merkez

  // Yön: fundingRate ve L/S oranının birleşimi
  let direction = 'neutral';
  const longSqueezeSignals = !fundingBiasLong && longRatio > 0.6 && priceChange > 0;
  const shortSqueezeSignals = fundingBiasLong && shortRatio > 0.6 && priceChange < 0;

  if (longSqueezeSignals || (fundingRate > FUNDING_NORMAL * 5 && longRatio > 0.6)) {
    direction = 'short';  // long kalabalığı sıkıştırılacak → short sinyal
  } else if (shortSqueezeSignals || (fundingRate < -FUNDING_NORMAL * 5 && shortRatio > 0.6)) {
    direction = 'long';   // short kalabalığı sıkıştırılacak → long sinyal
  }

  return {
    score: clamp(score),
    direction,
    components: { fundingNorm, imbalance, oiPressure, fundingBiasLong, moreShorts },
  };
}
```

- [ ] **Step 9.4: Testleri çalıştır — PASS bekliyoruz**

```bash
npm run test:signal-engine
```

Beklenen: Tüm testler PASS.

- [ ] **Step 9.5: Commit**

```bash
git add services/service-signal-engine/src/liquidation-pressure.js \
        services/service-signal-engine/test/unit/liquidation-pressure.test.js
git commit -m "feat: liquidation pressure scorer (funding + OI + L/S ratio)"
```

---

## Task 10: service-signal-engine — Confluence + Setup Builder

**Files:**
- Create: `borsa-bot/services/service-signal-engine/src/confluence.js`
- Create: `borsa-bot/services/service-signal-engine/src/setup-builder.js`
- Create: `borsa-bot/services/service-signal-engine/test/unit/confluence.test.js`
- Create: `borsa-bot/services/service-signal-engine/test/unit/setup-builder.test.js`

- [ ] **Step 10.1: confluence.test.js yaz**

`borsa-bot/services/service-signal-engine/test/unit/confluence.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { calcConfluence } from '../../src/confluence.js';

const strongLongIndicators = {
  ema9: 110, ema21: 108, ema50: 105,     // EMA dizilimi bullish
  rsi: 58,                                // momentum yüksek ama aşırı alım değil
  macd: { macd: 0.5, signal: 0.3, histogram: 0.2 },  // MACD pozitif
  bb: { upper: 115, middle: 110, lower: 105 },
  atr: 2.0,
  vwap: 109,
  currentPrice: 111,                      // fiyat VWAP üzerinde
};

const strongShortIndicators = {
  ema9: 98, ema21: 101, ema50: 105,       // EMA dizilimi bearish
  rsi: 38,
  macd: { macd: -0.5, signal: -0.3, histogram: -0.2 },
  bb: { upper: 105, middle: 101, lower: 97 },
  atr: 2.0,
  vwap: 100,
  currentPrice: 99,                       // fiyat VWAP altında
};

describe('calcConfluence', () => {
  it('güçlü long sinyallerinde long yönü ve yüksek skor döner', () => {
    const result = calcConfluence(strongLongIndicators, { score: 0.7, direction: 'long' }, 0.55);
    expect(result.direction).toBe('long');
    expect(result.score).toBeGreaterThan(0.55);
    expect(result.isCandidate).toBe(true);
  });

  it('güçlü short sinyallerinde short yönü döner', () => {
    const result = calcConfluence(strongShortIndicators, { score: 0.65, direction: 'short' }, 0.55);
    expect(result.direction).toBe('short');
    expect(result.isCandidate).toBe(true);
  });

  it('zayıf sinyallerde isCandidate false', () => {
    const weak = { ...strongLongIndicators, rsi: 50, macd: null };
    const result = calcConfluence(weak, { score: 0.4, direction: 'neutral' }, 0.65);
    expect(result.isCandidate).toBe(false);
  });

  it('skor her zaman 0..1', () => {
    const result = calcConfluence(strongLongIndicators, { score: 0.8, direction: 'long' }, 0.55);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 10.2: setup-builder.test.js yaz**

`borsa-bot/services/service-signal-engine/test/unit/setup-builder.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { buildSetup } from '../../src/setup-builder.js';

describe('buildSetup', () => {
  it('long setup: stop entry altında, target entry üzerinde', () => {
    const setup = buildSetup({
      direction: 'long',
      currentPrice: 100,
      atr: 2,
      rrMin: 1.5,
    });
    expect(setup.entryPrice).toBe(100);
    expect(setup.stopPrice).toBeLessThan(100);    // stop entry altında
    expect(setup.targetPrice).toBeGreaterThan(100); // target entry üzerinde
    expect(setup.rrRatio).toBeGreaterThanOrEqual(1.5);
  });

  it('short setup: stop entry üzerinde, target entry altında', () => {
    const setup = buildSetup({
      direction: 'short',
      currentPrice: 100,
      atr: 2,
      rrMin: 1.5,
    });
    expect(setup.stopPrice).toBeGreaterThan(100);
    expect(setup.targetPrice).toBeLessThan(100);
    expect(setup.rrRatio).toBeGreaterThanOrEqual(1.5);
  });

  it('R/R oranı doğru hesaplanır', () => {
    const setup = buildSetup({ direction: 'long', currentPrice: 100, atr: 2, rrMin: 2 });
    const risk   = setup.entryPrice - setup.stopPrice;
    const reward = setup.targetPrice - setup.entryPrice;
    const rr = reward / risk;
    expect(Math.abs(rr - setup.rrRatio)).toBeLessThan(0.01);
  });
});
```

- [ ] **Step 10.3: Test çalıştır — FAIL bekliyoruz**

```bash
npm run test:signal-engine
```

Beklenen: Module not found hataları.

- [ ] **Step 10.4: confluence.js yaz**

`borsa-bot/services/service-signal-engine/src/confluence.js`:
```js
// Multi-indicator confluence skoru.
// indicators: calcAllIndicators() çıktısı + currentPrice
// liqPressure: calcLiquidationPressure() çıktısı
// threshold: aday sayılmak için minimum skor (config'den gelir, örn. 0.65)
// Döner: { score, direction, isCandidate, breakdown }

function clamp(v, min = 0, max = 1) {
  return Math.min(max, Math.max(min, v));
}

export function calcConfluence(indicators, liqPressure, threshold) {
  const { ema9, ema21, ema50, rsi, macd, bb, vwap, currentPrice } = indicators;

  // --- Trend skoru (EMA dizilimi) ---
  let trendScore = 0;
  let trendDir = 'neutral';
  if (ema9 && ema21 && ema50) {
    if (ema9 > ema21 && ema21 > ema50) { trendScore = 1; trendDir = 'long'; }
    else if (ema9 < ema21 && ema21 < ema50) { trendScore = 1; trendDir = 'short'; }
    else if (ema9 > ema21 || ema21 > ema50) { trendScore = 0.5; trendDir = ema9 > ema21 ? 'long' : 'short'; }
    else trendScore = 0.3;
  }

  // --- Momentum skoru (RSI + MACD) ---
  let momentumScore = 0;
  let momentumDir = 'neutral';
  if (rsi !== null) {
    if (rsi > 50 && rsi < 70) { momentumScore += 0.5; momentumDir = 'long'; }
    else if (rsi < 50 && rsi > 30) { momentumScore += 0.5; momentumDir = 'short'; }
  }
  if (macd) {
    if (macd.histogram > 0 && macd.macd > macd.signal) { momentumScore += 0.5; }
    else if (macd.histogram < 0 && macd.macd < macd.signal) { momentumScore += 0.5; }
    const macdDir = macd.histogram > 0 ? 'long' : 'short';
    momentumDir = momentumDir === 'neutral' ? macdDir : momentumDir;
  }
  momentumScore = clamp(momentumScore);

  // --- Fiyat konumu skoru (BB + VWAP) ---
  let priceScore = 0;
  let priceDir = 'neutral';
  if (bb && currentPrice) {
    const bbRange = bb.upper - bb.lower;
    const relPos = bbRange > 0 ? (currentPrice - bb.lower) / bbRange : 0.5;
    if (relPos > 0.5 && relPos < 0.85) { priceScore += 0.5; priceDir = 'long'; }
    else if (relPos < 0.5 && relPos > 0.15) { priceScore += 0.5; priceDir = 'short'; }
  }
  if (vwap && currentPrice) {
    if (currentPrice > vwap) { priceScore += 0.5; priceDir = priceDir === 'neutral' ? 'long' : priceDir; }
    else { priceScore += 0.5; priceDir = priceDir === 'neutral' ? 'short' : priceDir; }
  }
  priceScore = clamp(priceScore);

  // --- Likidasyon baskısı ağırlığı ---
  const liqScore = liqPressure?.score ?? 0.5;
  const liqDir   = liqPressure?.direction ?? 'neutral';

  // --- Yön oyu ---
  const votes = [trendDir, momentumDir, priceDir, liqDir].filter(d => d !== 'neutral');
  const longVotes  = votes.filter(d => d === 'long').length;
  const shortVotes = votes.filter(d => d === 'short').length;
  const direction  = longVotes > shortVotes ? 'long' : shortVotes > longVotes ? 'short' : 'neutral';

  // Yön uyumluluğu bonusu
  const alignmentBonus = direction !== 'neutral' &&
    (direction === trendDir) && (direction === momentumDir) ? 0.1 : 0;

  // Toplam ağırlıklı skor
  const raw = 0.30 * trendScore + 0.25 * momentumScore + 0.20 * priceScore + 0.25 * (liqScore - 0.5 + 0.5) + alignmentBonus;
  const score = clamp(raw);

  return {
    score,
    direction,
    isCandidate: direction !== 'neutral' && score >= threshold,
    breakdown: { trendScore, momentumScore, priceScore, liqScore, trendDir, momentumDir, priceDir, liqDir },
  };
}
```

- [ ] **Step 10.5: setup-builder.js yaz**

`borsa-bot/services/service-signal-engine/src/setup-builder.js`:
```js
// ATR tabanlı giriş/stop/hedef üretimi.
// direction: 'long' | 'short'
// currentPrice: number — son kapanış fiyatı
// atr: number — son ATR değeri
// rrMin: number — minimum R/R oranı (config'den, örn. 1.5)

const ATR_STOP_MULT   = 1.5;  // stop = ATR * 1.5 uzakta
const ATR_ENTRY_MULT  = 0.3;  // giriş = biraz pullback bekleyerek (isteğe bağlı, şimdi 0)

export function buildSetup({ direction, currentPrice, atr, rrMin = 1.5 }) {
  const stopDist   = atr * ATR_STOP_MULT;
  const targetDist = stopDist * rrMin;

  let entryPrice, stopPrice, targetPrice;

  if (direction === 'long') {
    entryPrice  = currentPrice;
    stopPrice   = parseFloat((currentPrice - stopDist).toFixed(8));
    targetPrice = parseFloat((currentPrice + targetDist).toFixed(8));
  } else {
    entryPrice  = currentPrice;
    stopPrice   = parseFloat((currentPrice + stopDist).toFixed(8));
    targetPrice = parseFloat((currentPrice - targetDist).toFixed(8));
  }

  const risk   = Math.abs(entryPrice - stopPrice);
  const reward = Math.abs(targetPrice - entryPrice);
  const rrRatio = parseFloat((reward / risk).toFixed(3));

  return { entryPrice, stopPrice, targetPrice, rrRatio, stopDist, targetDist };
}
```

- [ ] **Step 10.6: Tüm testleri çalıştır — PASS bekliyoruz**

```bash
npm run test:signal-engine
```

Beklenen: Tüm testler PASS (indicators + liquidation-pressure + confluence + setup-builder).

- [ ] **Step 10.7: Commit**

```bash
git add services/service-signal-engine/src/ services/service-signal-engine/test/
git commit -m "feat: confluence scorer + setup builder (ATR-based entry/stop/target)"
```

---

## Task 11: service-signal-engine — Subscriber + Signal Repository

**Files:**
- Create: `borsa-bot/services/service-signal-engine/src/subscriber.js`
- Create: `borsa-bot/services/service-signal-engine/src/signal-repository.js`

- [ ] **Step 11.1: signal-repository.js yaz (Postgres writer)**

`borsa-bot/services/service-signal-engine/src/signal-repository.js`:
```js
import datasources from '@borsa-bot/datasource';

export async function saveSignal({
  symbol, direction, triggerTimeframe, entryPrice, stopPrice, targetPrice,
  rrRatio, confluenceScore, indicatorsSnapshot, liqPressureScore, liqDirection,
}) {
  const { postgres } = datasources;
  const sql = `
    INSERT INTO signals (
      symbol, direction, trigger_timeframe, entry_price, stop_price, target_price,
      rr_ratio, confluence_score, indicators_snapshot, liq_pressure_score, liq_direction
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING id, created_at
  `;
  const values = [
    symbol, direction, triggerTimeframe,
    entryPrice, stopPrice, targetPrice,
    rrRatio, confluenceScore,
    JSON.stringify(indicatorsSnapshot),
    liqPressureScore ?? null,
    liqDirection ?? null,
  ];
  const result = await postgres.query(sql, values);
  return result.rows[0];
}

export async function createOutcome(signalId) {
  const { postgres } = datasources;
  const sql = `
    INSERT INTO signal_outcomes (signal_id, status)
    VALUES ($1, 'pending')
    RETURNING id
  `;
  const result = await postgres.query(sql, [signalId]);
  return result.rows[0];
}
```

- [ ] **Step 11.2: subscriber.js yaz (Redis → engine döngüsü)**

`borsa-bot/services/service-signal-engine/src/subscriber.js`:
```js
import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { calcAllIndicators } from './indicators.js';
import { calcLiquidationPressure } from './liquidation-pressure.js';
import { calcConfluence } from './confluence.js';
import { buildSetup } from './setup-builder.js';
import { saveSignal, createOutcome } from './signal-repository.js';

const CANDLE_BUFFER_SIZE = 60;  // her sembol/TF için kaç mum saklanır

// { 'BTCUSDT.1m': Candle[], 'BTCUSDT.5m': Candle[], ... }
const candleBuffers = {};
// { 'BTCUSDT': { funding, oi, lsr } }
const marketState = {};
// Son sinyal zaman damgaları — cooldown için
const lastSignalTs = {};

export async function startSubscriber(config) {
  const subRedis = datasources.coreRedis.duplicate();

  // Her sembol + TF için mum kanalına abone ol
  const { rows: watchlist } = await datasources.postgres.query(
    'SELECT symbol, timeframes FROM watchlist WHERE active = true'
  );
  const { rows: configRows } = await datasources.postgres.query(
    "SELECT key, value FROM bot_config WHERE key IN ('confluence_threshold','rr_min','ai_enabled')"
  );
  const cfg = Object.fromEntries(configRows.map(r => [r.key, r.value]));
  const confluenceThreshold = parseFloat(cfg.confluence_threshold ?? 0.65);
  const rrMin = parseFloat(cfg.rr_min ?? 1.5);

  const channels = [];
  for (const { symbol, timeframes } of watchlist) {
    marketState[symbol] = { funding: { rate: 0, nextTs: 0 }, oi: { oi: 0, oiDelta: 0 }, lsr: { longRatio: 0.5, shortRatio: 0.5 } };
    for (const tf of timeframes) {
      const key = `${symbol}.${tf}`;
      candleBuffers[key] = [];
      channels.push(`md.${symbol}.${tf}`);
    }
    channels.push(`md.${symbol}.funding`);
    channels.push(`md.${symbol}.oi`);
    channels.push(`md.${symbol}.lsr`);
  }

  await subRedis.subscribe(...channels);
  helper.log.info(`Signal engine abone oldu: ${channels.length} kanal`);

  subRedis.on('message', async (channel, raw) => {
    try {
      const msg = JSON.parse(raw);
      await handleMessage(channel, msg, { confluenceThreshold, rrMin });
    } catch (err) {
      helper.log.error('Subscriber mesaj işleme hatası:', err.message);
    }
  });
}

async function handleMessage(channel, msg, { confluenceThreshold, rrMin }) {
  const { type, symbol, data } = msg;

  if (type === 'funding') {
    if (marketState[symbol]) marketState[symbol].funding = data;
    return;
  }
  if (type === 'oi') {
    if (marketState[symbol]) {
      const prev = marketState[symbol].oi?.oi ?? 0;
      marketState[symbol].oi = { oi: data.oi, oiDelta: data.oi - prev };
    }
    return;
  }
  if (type === 'lsr') {
    if (marketState[symbol]) marketState[symbol].lsr = data;
    return;
  }
  if (type !== 'candle') return;

  const tf = msg.tf;
  const bufKey = `${symbol}.${tf}`;
  if (!candleBuffers[bufKey]) return;

  // Mum buffer'ını güncelle
  candleBuffers[bufKey].push(data);
  if (candleBuffers[bufKey].length > CANDLE_BUFFER_SIZE) {
    candleBuffers[bufKey].shift();
  }

  const candles = candleBuffers[bufKey];
  if (candles.length < 30) return;  // yeterli veri yok

  // İndikatörleri hesapla
  const indicators = calcAllIndicators(candles);
  indicators.currentPrice = data.close;

  // Likidasyon baskısını hesapla
  const state = marketState[symbol] ?? {};
  const prevClose = candles.length > 1 ? candles[candles.length - 2].close : data.close;
  const priceChange = prevClose > 0 ? (data.close - prevClose) / prevClose : 0;

  const liqPressure = calcLiquidationPressure({
    fundingRate:  state.funding?.rate ?? 0,
    oiDelta:      state.oi?.oiDelta ?? 0,
    longRatio:    state.lsr?.longRatio ?? 0.5,
    shortRatio:   state.lsr?.shortRatio ?? 0.5,
    priceChange,
  });

  // Confluence skoru
  const confluence = calcConfluence(indicators, liqPressure, confluenceThreshold);
  if (!confluence.isCandidate) return;

  // Cooldown — aynı sembol için son 5 dakikada sinyal verilmişse atla
  const cooldownKey = `${symbol}.${confluence.direction}`;
  const now = Date.now();
  if (lastSignalTs[cooldownKey] && now - lastSignalTs[cooldownKey] < 5 * 60 * 1000) {
    helper.log.debug(`Cooldown aktif: ${cooldownKey}`);
    return;
  }
  lastSignalTs[cooldownKey] = now;

  // Setup oluştur
  const setup = buildSetup({
    direction: confluence.direction,
    currentPrice: data.close,
    atr: indicators.atr,
    rrMin,
  });

  // Veritabanına kaydet
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

  helper.log.info(`✅ YENİ SİNYAL: ${symbol} ${confluence.direction.toUpperCase()} | TF:${tf} | Skor:${confluence.score.toFixed(3)} | Giriş:${setup.entryPrice} | Stop:${setup.stopPrice} | Hedef:${setup.targetPrice} | RR:${setup.rrRatio}`);

  // Redis'e de yayınla (notifier servisi dinleyecek — Task 11+)
  await datasources.coreRedis.publish(
    'signals.new',
    JSON.stringify({ signalId: signal.id, symbol, direction: confluence.direction, ...setup, confluenceScore: confluence.score }),
  );
}
```

- [ ] **Step 11.3: service-signal-engine main.js yaz**

`borsa-bot/services/service-signal-engine/main.js`:
```js
import express from 'express';
import loadConfig from '@borsa-bot/config';
import { createDatasources } from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { createServiceDiscovery } from '@borsa-bot/service-discovery';
import appConfigSchema from './configs/app-config.js';
import { startSubscriber } from './src/subscriber.js';

async function initialize() {
  const config = loadConfig(appConfigSchema);
  const app = express();

  await createDatasources(config).catch(helper.exitOnError);

  const ds = (await import('@borsa-bot/datasource')).default;
  const sd = createServiceDiscovery(ds.discoveryRedis, 'service-signal-engine', { port: config.port });
  await sd.register();
  sd.startHeartbeat();

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'service-signal-engine' }));
  app.listen(config.port, () => helper.appStarted(config));

  await startSubscriber(config);
}

initialize().catch(helper.exitOnError);
```

`borsa-bot/services/service-signal-engine/configs/app-config.js`:
```js
export default {
  port:             { default: 3102, env: 'SIGNAL_ENGINE_PORT', type: 'number' },
  nodeEnv:          { default: 'development', env: 'NODE_ENV', type: 'enum', values: ['development', 'production', 'test'] },
  databaseUrl:      { env: 'DATABASE_URL' },
  coreRedisUrl:     { default: 'redis://localhost:6379', env: 'CORE_REDIS_URL' },
  discoveryRedisUrl:{ default: 'redis://localhost:6379', env: 'CORE_DISCOVERY_REDIS_URL' },
};
```

- [ ] **Step 11.4: Tüm testleri çalıştır**

```bash
npm test
```

Beklenen: Tüm unit testler PASS (0 fail).

- [ ] **Step 11.5: Uçtan uca entegrasyon testi (manuel)**

```bash
# Terminal 1: Redis sinyallerini izle
redis-cli -u redis://localhost:6379 SUBSCRIBE "signals.new"

# Terminal 2: Market data servisini başlat
npm run dev:market-data

# Terminal 3: Signal engine başlat (market-data tamamen başladıktan sonra)
sleep 5 && npm run dev:signal-engine

# Birkaç dakika bekle — logs'da sinyal çıkması için (scalp koşulları oluşunca)
```

Beklenen: Terminal 3 loglarında indikatör hesaplamaları görülür. Confluence eşiği aşılınca:
```
✅ YENİ SİNYAL: BTCUSDT LONG | TF:5m | Skor:0.xxx | Giriş:xxx | Stop:xxx | Hedef:xxx | RR:x.xx
```
Ve Terminal 1'de aynı mesaj JSON olarak gelir.

```bash
# Postgres'te kayıt doğrula
psql $DATABASE_URL -c "SELECT symbol, direction, confluence_score, entry_price, created_at FROM signals ORDER BY created_at DESC LIMIT 5;"
```

- [ ] **Step 11.6: Final commit**

```bash
git add services/service-signal-engine/ services/service-market-data/
git commit -m "feat: signal engine subscriber + signal-repository (full pipeline)"
```

---

## Doğrulama Özeti

| Kontrol | Komut | Beklenen |
|---|---|---|
| Docker ayakta | `docker compose ps` | postgres + redis running |
| DB tabloları | `psql $DATABASE_URL -c "\dt"` | 4 tablo listesi |
| Watchlist | `psql $DATABASE_URL -c "SELECT * FROM watchlist;"` | BTC + ETH |
| Market data WS | Terminal: `redis-cli SUBSCRIBE "md.BTCUSDT.1m"` + servisi başlat | JSON mum akışı |
| Unit testler | `npm test` | Tüm testler PASS |
| Signal üretimi | Signal engine + market data çalışırken | Postgres'te signals satırı |

---

## Sonraki Planlar (Bu Plan Dışı)

- **Faz 1B:** `service-backtest` — Bitget REST'ten geçmiş mum çek, aynı engine mantığını uygula, metrik üret (win rate, profit factor, drawdown). Backtest olmadan canlıya alma!
- **Faz 1C:** `ai-service` (Python/FastAPI/Ollama) — Signal engine'den gelen aday kurulumu `qwen2.5:7b` ile doğrula, JSON guard, throttle.
- **Faz 1D:** `service-notifier` + Telegram + `service-tracker` (forward-test).
- **Faz 1E:** `gateway` + `web-panel` (React).
