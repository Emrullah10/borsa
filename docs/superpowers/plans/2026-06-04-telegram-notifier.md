# Telegram Notifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `service-notifier` adında yeni bir Node.js mikro-servisi yaz — Redis `signals.new` kanalını dinle, gelen her sinyali Telegram bot aracılığıyla kullanıcıya bildirim olarak gönder.

**Architecture:** service-signal-engine zaten her yeni sinyali `signals.new` Redis kanalına publish ediyor. service-notifier bu kanalı subscribe eder, mesajı Telegram mesaj formatına çevirir ve Telegram Bot API'ye HTTP POST atar. Servis bağımsız — signal-engine'e dokunulmaz.

**Tech Stack:** Node.js ESM, `node-telegram-bot-api` npm paketi, Redis (mevcut `@borsa-bot/datasource`), `@borsa-bot/helper`, `@borsa-bot/config`, Vitest (test)

---

## Dosya Yapısı

```
backend/services/service-notifier/
├── main.js                  ← servis girişi, Redis subscribe, env doğrulama
├── src/
│   ├── telegram.js          ← Telegram mesaj gönderme (sendSignalAlert)
│   ├── formatter.js         ← sinyal objesini → Telegram mesaj metnine çevir
│   └── formatter.test.js    ← formatter unit testleri
├── configs/
│   └── app-config.js        ← zod şema: port, telegramToken, telegramChatId
└── package.json             ← (backend workspace'e dahil, ayrı package.json YOK)
```

backend/package.json'a yeni script eklenecek:
```
"dev:notifier": "node services/service-notifier/main.js"
```

backend/.env.example'a eklenecek:
```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

---

## Task 1: formatter.js — sinyal → Telegram metni

**Files:**
- Create: `backend/services/service-notifier/src/formatter.js`
- Create: `backend/services/service-notifier/src/formatter.test.js`

- [ ] **Step 1: Test dosyasını yaz**

```js
// backend/services/service-notifier/src/formatter.test.js
import { describe, it, expect } from 'vitest';
import { formatSignalMessage } from './formatter.js';

const longSignal = {
  signalId: 'abc-123',
  symbol: 'BTCUSDT',
  direction: 'long',
  entryPrice: 64000,
  stopPrice: 63700,
  targetPrice: 64500,
  confluenceScore: 0.88,
  createdAt: '2026-06-04T07:00:00.000Z',
};

const shortSignal = { ...longSignal, direction: 'short', entryPrice: 64000, stopPrice: 64300, targetPrice: 63500 };

describe('formatSignalMessage', () => {
  it('long sinyal için doğru emoji ve yön gösterir', () => {
    const msg = formatSignalMessage(longSignal);
    expect(msg).toContain('🟢');
    expect(msg).toContain('LONG');
    expect(msg).toContain('BTCUSDT');
  });

  it('short sinyal için doğru emoji ve yön gösterir', () => {
    const msg = formatSignalMessage(shortSignal);
    expect(msg).toContain('🔴');
    expect(msg).toContain('SHORT');
  });

  it('giriş, stop, hedef fiyatları içerir', () => {
    const msg = formatSignalMessage(longSignal);
    expect(msg).toContain('64000');
    expect(msg).toContain('63700');
    expect(msg).toContain('64500');
  });

  it('confluence skorunu yüzde olarak gösterir', () => {
    const msg = formatSignalMessage(longSignal);
    expect(msg).toContain('88%');
  });

  it('stop ve hedef için yüzde fark gösterir', () => {
    const msg = formatSignalMessage(longSignal);
    expect(msg).toMatch(/-0\.\d+%/); // stop fark negatif
    expect(msg).toMatch(/\+0\.\d+%/); // hedef fark pozitif
  });
});
```

- [ ] **Step 2: Testi çalıştır — FAIL beklenir**

```bash
cd backend && npx vitest run services/service-notifier/src/formatter.test.js 2>&1 | tail -10
```

Beklenen: `Cannot find module './formatter.js'`

- [ ] **Step 3: formatter.js yaz**

```js
// backend/services/service-notifier/src/formatter.js

function pct(from, to) {
  const diff = ((to - from) / from) * 100;
  return (diff >= 0 ? '+' : '') + diff.toFixed(2) + '%';
}

export function formatSignalMessage({ symbol, direction, entryPrice, stopPrice, targetPrice, confluenceScore, createdAt }) {
  const isLong = direction === 'long';
  const emoji = isLong ? '🟢' : '🔴';
  const dir = direction.toUpperCase();
  const conf = Math.round((confluenceScore ?? 0) * 100);
  const time = new Date(createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  return [
    `${emoji} *${symbol}* — ${dir}`,
    `Güven: %${conf}`,
    ``,
    `📍 Giriş:  \`${entryPrice}\``,
    `🛑 Stop:   \`${stopPrice}\` (${pct(entryPrice, stopPrice)})`,
    `🎯 Hedef:  \`${targetPrice}\` (${pct(entryPrice, targetPrice)})`,
    `⚖️ R/R:    1.5`,
    ``,
    `🕐 ${time}`,
  ].join('\n');
}
```

- [ ] **Step 4: Testi çalıştır — PASS beklenir**

```bash
cd backend && npx vitest run services/service-notifier/src/formatter.test.js 2>&1 | tail -10
```

Beklenen: `5 passed`

- [ ] **Step 5: Commit**

```bash
cd backend && git add services/service-notifier/src/formatter.js services/service-notifier/src/formatter.test.js
git commit -m "feat(notifier): add signal message formatter"
```

---

## Task 2: telegram.js — Telegram API client

**Files:**
- Create: `backend/services/service-notifier/src/telegram.js`

Not: Bu dosya HTTP fetch kullanır, test mock'u service-level'da yapılır. Unit test YOK (sadece dış API sarmalıyor).

- [ ] **Step 1: node-telegram-bot-api kur**

```bash
cd backend && npm install node-telegram-bot-api
```

- [ ] **Step 2: telegram.js yaz**

```js
// backend/services/service-notifier/src/telegram.js
import TelegramBot from 'node-telegram-bot-api';
import helper from '@borsa-bot/helper';

let bot = null;

export function initTelegram(token) {
  bot = new TelegramBot(token);
}

export async function sendSignalAlert(chatId, text) {
  if (!bot) throw new Error('Telegram bot başlatılmadı — initTelegram() çağrılmadı');
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    helper.log.info(`Telegram bildirim gönderildi: ${chatId}`);
  } catch (err) {
    helper.log.error('Telegram gönderim hatası:', err.message);
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd backend && git add services/service-notifier/src/telegram.js
git commit -m "feat(notifier): add telegram client wrapper"
```

---

## Task 3: app-config.js — ortam değişkenleri şeması

**Files:**
- Create: `backend/services/service-notifier/configs/app-config.js`

- [ ] **Step 1: app-config.js yaz**

`@borsa-bot/config` kendi formatını kullanıyor: `{ env, default, type }`. Zod YOK.

```js
// backend/services/service-notifier/configs/app-config.js
export default {
  port:              { default: 3103, env: 'NOTIFIER_PORT', type: 'number' },
  nodeEnv:           { default: 'development', env: 'NODE_ENV' },
  coreRedisUrl:      { default: 'redis://localhost:6379', env: 'CORE_REDIS_URL' },
  discoveryRedisUrl: { default: 'redis://localhost:6379', env: 'CORE_DISCOVERY_REDIS_URL' },
  databaseUrl:       { env: 'DATABASE_URL', default: 'postgres://botuser:botpass@localhost:5432/borsabot' },
  telegramBotToken:  { env: 'TELEGRAM_BOT_TOKEN' },
  telegramChatId:    { env: 'TELEGRAM_CHAT_ID' },
};
```

- [ ] **Step 2: .env.example güncelle**

```bash
echo "" >> /Users/emrullah/developer/fullStack/borsa/backend/.env.example
echo "# Telegram Notifier" >> /Users/emrullah/developer/fullStack/borsa/backend/.env.example
echo "TELEGRAM_BOT_TOKEN=" >> /Users/emrullah/developer/fullStack/borsa/backend/.env.example
echo "TELEGRAM_CHAT_ID=" >> /Users/emrullah/developer/fullStack/borsa/backend/.env.example
```

- [ ] **Step 3: Commit**

```bash
cd backend && git add services/service-notifier/configs/app-config.js .env.example
git commit -m "feat(notifier): add config schema and env vars"
```

---

## Task 4: main.js — servis girişi ve Redis subscriber

**Files:**
- Create: `backend/services/service-notifier/main.js`
- Modify: `backend/package.json` (script ekle)

- [ ] **Step 1: main.js yaz**

```js
// backend/services/service-notifier/main.js
import loadConfig from '@borsa-bot/config';
import { createDatasources } from '@borsa-bot/datasource';
import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { createServiceDiscovery } from '@borsa-bot/service-discovery';
import appConfigSchema from './configs/app-config.js';
import { initTelegram, sendSignalAlert } from './src/telegram.js';
import { formatSignalMessage } from './src/formatter.js';

async function initialize() {
  const config = loadConfig(appConfigSchema);

  await createDatasources(config).catch(helper.exitOnError);

  const sd = createServiceDiscovery(
    datasources.discoveryRedis,
    'service-notifier',
    { port: config.port, version: '1.0.0' },
  );
  await sd.register();
  sd.startHeartbeat();

  initTelegram(config.telegramBotToken);

  const sub = datasources.coreRedis.duplicate();
  await sub.subscribe('signals.new');

  sub.on('message', async (_channel, raw) => {
    try {
      const signal = JSON.parse(raw);
      const text = formatSignalMessage(signal);
      await sendSignalAlert(config.telegramChatId, text);
    } catch (err) {
      helper.log.error('Notifier message error:', err.message);
    }
  });

  helper.log.info(`Service ready — port: ${config.port}, env: ${config.nodeEnv}`);
  helper.log.info('Telegram notifier aktif — signals.new kanalı dinleniyor');
}

initialize().catch(helper.exitOnError);
```

- [ ] **Step 2: package.json'a script ekle**

`backend/package.json` dosyasındaki `"scripts"` bloğuna şunu ekle:

```json
"dev:notifier": "node services/service-notifier/main.js"
```

- [ ] **Step 3: Commit**

```bash
cd backend && git add services/service-notifier/main.js package.json
git commit -m "feat(notifier): add main service entry with Redis subscriber"
```

---

## Task 5: Entegrasyon testi — uçtan uca doğrulama

**Files:** Test yok (manuel doğrulama)

- [ ] **Step 1: Telegram bot oluştur**

1. Telegram'da `@BotFather`'a mesaj at
2. `/newbot` → isim ver → `@<isim>bot` ver
3. Token al: `123456789:AAF...` formatında
4. Kendine mesaj at → `@userinfobot`'tan chat ID'yi öğren

- [ ] **Step 2: .env dosyasına ekle**

```bash
# backend/.env dosyasına ekle (yoksa oluştur)
TELEGRAM_BOT_TOKEN=123456789:AAF...
TELEGRAM_CHAT_ID=987654321
```

- [ ] **Step 3: Servisi başlat**

```bash
cd backend && npm run dev:notifier
```

Beklenen log:
```
[...] INFO  Service ready — port: 3103, env: development
[...] INFO  Telegram notifier aktif — signals.new kanalı dinleniyor
```

- [ ] **Step 4: Test sinyali gönder**

```bash
# Yeni terminal — Redis'e elle sinyal publish et
redis-cli PUBLISH signals.new '{"signalId":"test-1","symbol":"BTCUSDT","direction":"long","entryPrice":64000,"stopPrice":63700,"targetPrice":64500,"confluenceScore":0.88,"createdAt":"2026-06-04T07:00:00.000Z"}'
```

Beklenen: Telefonuna Telegram mesajı düşer.

- [ ] **Step 5: Tüm testleri çalıştır**

```bash
cd backend && npm test 2>&1 | tail -10
```

Beklenen: Tüm testler PASS (formatter 5 test dahil).

- [ ] **Step 6: launch.json'a ekle**

`.vscode/launch.json` dosyasındaki `compounds` bloğuna service-notifier'ı ekle. Ayrıca tek başına çalıştırmak için:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Backend: Notifier",
  "program": "${workspaceFolder}/backend/services/service-notifier/main.js",
  "cwd": "${workspaceFolder}/backend",
  "envFile": "${workspaceFolder}/backend/.env"
}
```

---

## Kurulum Notu (Telegram bot token almak için)

Servis çalışmadan önce kullanıcının şunları yapması gerekir:

1. Telegram'da `@BotFather`'a `/newbot` yaz
2. Verilen token'ı `backend/.env`'e `TELEGRAM_BOT_TOKEN=...` olarak ekle
3. `@userinfobot`'a `/start` yaz → chat ID al → `TELEGRAM_CHAT_ID=...` olarak ekle
4. `npm run dev:notifier` ile başlat
