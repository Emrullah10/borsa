# Email Notifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** `service-notifier` adında yeni bir Node.js mikro-servisi yaz — Redis `signals.new` kanalını dinle, gelen her sinyali Gmail SMTP ile e-posta olarak gönder.

**Architecture:** service-signal-engine her yeni sinyali `signals.new` Redis kanalına publish ediyor. service-notifier bu kanalı subscribe eder, mesajı HTML e-posta formatına çevirir ve `nodemailer` ile Gmail SMTP üzerinden gönderir. Bağımsız servis — signal-engine'e dokunulmaz.

**Tech Stack:** Node.js ESM, `nodemailer` npm paketi, Redis (mevcut `@borsa-bot/datasource`), `@borsa-bot/helper`, `@borsa-bot/config`, Vitest

---

## Dosya Yapısı

```
backend/services/service-notifier/
├── main.js                  ← servis girişi, Redis subscribe
├── src/
│   ├── mailer.js            ← nodemailer transporter, sendSignalEmail()
│   ├── formatter.js         ← sinyal → HTML e-posta metni
│   └── formatter.test.js    ← formatter unit testleri
└── configs/
    └── app-config.js        ← port, gmailUser, gmailPass, emailTo
```

backend/package.json'a eklenecek script:
```
"dev:notifier": "node services/service-notifier/main.js"
```

backend/.env'e eklenecek:
```
GMAIL_USER=filont1010@gmail.com
GMAIL_APP_PASSWORD=<16 haneli app password>
EMAIL_TO=filont1010@gmail.com
```

---

## Task 1: formatter.js — sinyal → HTML e-posta

**Files:**
- Create: `backend/services/service-notifier/src/formatter.js`
- Create: `backend/services/service-notifier/src/formatter.test.js`

- [ ] **Step 1: Test dosyasını yaz**

```js
// backend/services/service-notifier/src/formatter.test.js
import { describe, it, expect } from 'vitest';
import { formatEmailSubject, formatEmailHtml } from './formatter.js';

const longSignal = {
  symbol: 'BTCUSDT',
  direction: 'long',
  entryPrice: 64000,
  stopPrice: 63700,
  targetPrice: 64500,
  confluenceScore: 0.88,
  createdAt: '2026-06-04T07:00:00.000Z',
};

const shortSignal = { ...longSignal, direction: 'short', stopPrice: 64300, targetPrice: 63500 };

describe('formatEmailSubject', () => {
  it('long sinyal için konu satırı üretir', () => {
    const s = formatEmailSubject(longSignal);
    expect(s).toContain('BTCUSDT');
    expect(s).toContain('LONG');
    expect(s).toContain('🟢');
  });

  it('short sinyal için konu satırı üretir', () => {
    const s = formatEmailSubject(shortSignal);
    expect(s).toContain('SHORT');
    expect(s).toContain('🔴');
  });
});

describe('formatEmailHtml', () => {
  it('giriş, stop, hedef fiyatları içerir', () => {
    const html = formatEmailHtml(longSignal);
    expect(html).toContain('64000');
    expect(html).toContain('63700');
    expect(html).toContain('64500');
  });

  it('confluence skorunu yüzde gösterir', () => {
    const html = formatEmailHtml(longSignal);
    expect(html).toContain('88%');
  });

  it('stop için negatif, hedef için pozitif yüzde fark içerir', () => {
    const html = formatEmailHtml(longSignal);
    expect(html).toMatch(/-0\.\d+%/);
    expect(html).toMatch(/\+0\.\d+%/);
  });

  it('HTML yapısı geçerli', () => {
    const html = formatEmailHtml(longSignal);
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });
});
```

- [ ] **Step 2: Testi çalıştır — FAIL beklenir**

```bash
cd /Users/emrullah/developer/fullStack/borsa/backend && npx vitest run services/service-notifier/src/formatter.test.js 2>&1 | tail -10
```

Beklenen: `Cannot find module './formatter.js'`

- [ ] **Step 3: formatter.js yaz**

```js
// backend/services/service-notifier/src/formatter.js

function pct(from, to) {
  const diff = ((to - from) / from) * 100;
  return (diff >= 0 ? '+' : '') + diff.toFixed(2) + '%';
}

export function formatEmailSubject({ symbol, direction }) {
  const emoji = direction === 'long' ? '🟢' : '🔴';
  return `${emoji} Scalp Sinyali: ${symbol} ${direction.toUpperCase()}`;
}

export function formatEmailHtml({ symbol, direction, entryPrice, stopPrice, targetPrice, confluenceScore, createdAt }) {
  const isLong = direction === 'long';
  const emoji = isLong ? '🟢' : '🔴';
  const dirLabel = direction.toUpperCase();
  const conf = Math.round((confluenceScore ?? 0) * 100);
  const color = isLong ? '#26a69a' : '#ef5350';
  const time = new Date(createdAt).toLocaleString('tr-TR');

  return `<html>
<body style="margin:0;padding:0;background:#0d1117;font-family:monospace;">
  <div style="max-width:480px;margin:32px auto;background:#161b22;border-radius:12px;overflow:hidden;border:1px solid #21262d;">
    <div style="background:${color};padding:16px 24px;">
      <h2 style="margin:0;color:#fff;font-size:20px;">${emoji} ${symbol} — ${dirLabel}</h2>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Güven: %${conf} &nbsp;|&nbsp; ${time}</p>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;color:#c9d1d9;">
        <tr style="border-bottom:1px solid #21262d;">
          <td style="padding:10px 0;color:#8b949e;font-size:13px;">📍 Giriş</td>
          <td style="padding:10px 0;text-align:right;font-size:16px;font-weight:700;">${entryPrice}</td>
        </tr>
        <tr style="border-bottom:1px solid #21262d;">
          <td style="padding:10px 0;color:#8b949e;font-size:13px;">🛑 Stop</td>
          <td style="padding:10px 0;text-align:right;">
            <span style="font-size:16px;font-weight:700;">${stopPrice}</span>
            <span style="color:#ef5350;font-size:12px;margin-left:8px;">${pct(entryPrice, stopPrice)}</span>
          </td>
        </tr>
        <tr style="border-bottom:1px solid #21262d;">
          <td style="padding:10px 0;color:#8b949e;font-size:13px;">🎯 Hedef</td>
          <td style="padding:10px 0;text-align:right;">
            <span style="font-size:16px;font-weight:700;">${targetPrice}</span>
            <span style="color:#26a69a;font-size:12px;margin-left:8px;">${pct(entryPrice, targetPrice)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#8b949e;font-size:13px;">⚖️ R/R</td>
          <td style="padding:10px 0;text-align:right;font-size:16px;font-weight:700;">1.5</td>
        </tr>
      </table>
    </div>
    <div style="padding:12px 24px;border-top:1px solid #21262d;text-align:center;">
      <p style="margin:0;color:#8b949e;font-size:11px;">Scalp Asistanı — otomatik sinyal bildirimi</p>
    </div>
  </div>
</body>
</html>`;
}
```

- [ ] **Step 4: Testi çalıştır — PASS beklenir**

```bash
cd /Users/emrullah/developer/fullStack/borsa/backend && npx vitest run services/service-notifier/src/formatter.test.js 2>&1 | tail -10
```

Beklenen: `6 passed`

---

## Task 2: mailer.js + app-config.js + main.js

**Files:**
- Create: `backend/services/service-notifier/src/mailer.js`
- Create: `backend/services/service-notifier/configs/app-config.js`
- Create: `backend/services/service-notifier/main.js`
- Modify: `backend/package.json`

- [ ] **Step 1: nodemailer kur**

```bash
cd /Users/emrullah/developer/fullStack/borsa/backend && npm install nodemailer
```

- [ ] **Step 2: app-config.js yaz**

```js
// backend/services/service-notifier/configs/app-config.js
export default {
  port:              { default: 3103, env: 'NOTIFIER_PORT', type: 'number' },
  nodeEnv:           { default: 'development', env: 'NODE_ENV' },
  coreRedisUrl:      { default: 'redis://localhost:6379', env: 'CORE_REDIS_URL' },
  discoveryRedisUrl: { default: 'redis://localhost:6379', env: 'CORE_DISCOVERY_REDIS_URL' },
  databaseUrl:       { default: 'postgres://botuser:botpass@localhost:5432/borsabot', env: 'DATABASE_URL' },
  gmailUser:         { env: 'GMAIL_USER' },
  gmailAppPassword:  { env: 'GMAIL_APP_PASSWORD' },
  emailTo:           { env: 'EMAIL_TO' },
};
```

- [ ] **Step 3: mailer.js yaz**

```js
// backend/services/service-notifier/src/mailer.js
import nodemailer from 'nodemailer';
import helper from '@borsa-bot/helper';

let transporter = null;
let emailTo = null;

export function initMailer(gmailUser, gmailAppPassword, to) {
  emailTo = to;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailAppPassword },
  });
}

export async function sendSignalEmail(subject, html) {
  if (!transporter) throw new Error('Mailer başlatılmadı — initMailer() çağrılmadı');
  try {
    await transporter.sendMail({
      from: `"Scalp Asistanı" <${transporter.options.auth.user}>`,
      to: emailTo,
      subject,
      html,
    });
    helper.log.info(`E-posta gönderildi: ${subject}`);
  } catch (err) {
    helper.log.error('E-posta gönderim hatası:', err.message);
  }
}
```

- [ ] **Step 4: main.js yaz**

```js
// backend/services/service-notifier/main.js
import loadConfig from '@borsa-bot/config';
import { createDatasources } from '@borsa-bot/datasource';
import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { createServiceDiscovery } from '@borsa-bot/service-discovery';
import appConfigSchema from './configs/app-config.js';
import { initMailer, sendSignalEmail } from './src/mailer.js';
import { formatEmailSubject, formatEmailHtml } from './src/formatter.js';

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

  initMailer(config.gmailUser, config.gmailAppPassword, config.emailTo);

  const sub = datasources.coreRedis.duplicate();
  await sub.subscribe('signals.new');

  sub.on('message', async (_channel, raw) => {
    try {
      const signal = JSON.parse(raw);
      const subject = formatEmailSubject(signal);
      const html = formatEmailHtml(signal);
      await sendSignalEmail(subject, html);
    } catch (err) {
      helper.log.error('Notifier message error:', err.message);
    }
  });

  helper.log.info(`Service ready — port: ${config.port}, env: ${config.nodeEnv}`);
  helper.log.info(`E-posta notifier aktif → ${config.emailTo}`);
}

initialize().catch(helper.exitOnError);
```

- [ ] **Step 5: package.json'a script ekle**

`backend/package.json` → `"scripts"` bloğuna ekle:
```json
"dev:notifier": "node services/service-notifier/main.js"
```

- [ ] **Step 6: .env dosyasına credentials ekle**

`backend/.env` dosyasına (yoksa oluştur):
```
GMAIL_USER=filont1010@gmail.com
GMAIL_APP_PASSWORD=<aldığın 16 haneli app password>
EMAIL_TO=filont1010@gmail.com
```

- [ ] **Step 7: Tüm testleri çalıştır**

```bash
cd /Users/emrullah/developer/fullStack/borsa/backend && npm test 2>&1 | tail -10
```

Beklenen: Tüm testler PASS.

- [ ] **Step 8: Servisi başlat ve test et**

```bash
cd /Users/emrullah/developer/fullStack/borsa/backend && npm run dev:notifier
```

Beklenen log:
```
[...] INFO  Service ready — port: 3103
[...] INFO  E-posta notifier aktif → filont1010@gmail.com
```

Test sinyali gönder:
```bash
redis-cli PUBLISH signals.new '{"symbol":"BTCUSDT","direction":"long","entryPrice":64000,"stopPrice":63700,"targetPrice":64500,"confluenceScore":0.88,"createdAt":"2026-06-04T07:00:00.000Z"}'
```

Beklenen: E-postana sinyal maili düşer.
