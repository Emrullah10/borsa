# 📂 tropiq‑mono‑repo – Tam Klasör & Dosya Açıklaması

*(tamamen yeni başlayanlar için hazırlanmıştır; repo içinde mikro‑servis mimarisinin nasıl çalıştığını açıklamaktadır)*

---

### 1️⃣ Yüksek‑seviye Diyagram

```
[tropiq-mono-repo/]
├─ .codegraph/                # (CodeGraph indeksi – `codegraph init` ile oluşturulur)
├─ .git/                      # Git geçmişi
├─ .env, .env.example, .env.test
├─ .gitignore
├─ CLAUDE.md
├─ README.md
├─ db‑schemas/                # Her servis için bir SQL şeması + ortak şema
│   ├─ 00‑enums‑schema.sql
│   ├─ 01‑identity‑schema.sql
│   ├─ 02‑rfq‑schema.sql
│   ├─ … (diğer servis‑özgü şemalar)
│   └─ combined‑schema.sql    # Tüm monorepo için tam DB şeması
├─ landing‑app/               # (opsiyonel UI‑demo / tanıtım sitesi)
├─ packages/                  # Paylaşılan tekrar kullanılabilir modüller
│   └─ modules/
│       ├─ config/            # Merkezi yapılandırma yükleyici
│       ├─ datasource/        # DB & önbellek bağlantı fabrikaları
│       ├─ helper/            # Küçük yardımcılar (loglama, hata çıkışı, …)
│       └─ service‑discovery/ # Redis‑tabanlı servis‑kayıt istemcisi
├─ services/                  # **Her mikro‑servis bir klasör**
│   ├─ service‑analytics/
│   │   ├─ configs/
│   │   ├─ definitions/       # Bu servisin OpenAPI tanımı
│   │   ├─ middlewares/
│   │   ├─ src/               # İş mantığı (boot, controller, …)
│   │   ├─ test/              # Unit / integration / e2e testler
│   │   ├─ main.js            # Giriş noktası – Express uygulamasını başlatır
│   │   └─ package.json
│   ├─ service‑audit/          # (aynı yapı)
│   ├─ service‑bidding/        # (aynı yapı)
│   ├─ service‑billing/        # (aynı yapı)
│   ├─ service‑document/       # (aynı yapı)
│   ├─ service‑identity/
│   │   ├─ configs/
│   │   ├─ definitions/
│   │   ├─ middlewares/
│   │   ├─ src/
│   │   ├─ test/
│   │   │   ├─ unit/
│   │   │   ├─ integration/
│   │   │   └─ e2e/
│   │   ├─ main.js            # **Giriş noktası** – aşağıdaki kod örneği
│   │   └─ package.json
│   ├─ service‑notification/   # (aynı yapı)
│   ├─ service‑reference/      # (aynı yapı)
│   ├─ service‑rfq/            # (aynı yapı)
│   └─ service‑shipment/       # (aynı yapı)
├─ package.json               # Kök npm betikleri & ortak bağımlılıklar
└─ eslint.config.js           # Tüm repo için lint kuralları
```

> **Temel fikir:** `services/` altındaki her klasör bağımsız bir **Node.js/Express mikro‑servisi**. Tüm servisler aynı Node sürümünü (≥ 20) ve `packages/modules/` içindeki ortak modülleri kullanır. Servisler bağımsız olarak (`pm2` ya da Docker) çalıştırılır ve birbirlerini **service‑discovery** modülü aracılığıyla Redis tabanlı bir kayıt defteri üzerinden bulur.

---

### 2️⃣ Kök Düzeyindeki Öğeler Ne İş Yapar?

| Yol | Tür | Açıklama |
|-----|----|----------|
| `.codegraph/` | gizli klasör | CodeGraph indeksi; sembolleri ve bağımlılıkları hızlıca bulmak için kullanılır (`codegraph init`). |
| `.git/` | gizli klasör | Versiyon kontrol geçmişi. |
| `.env*` | dosya | Ortam‑spesifik değişkenler (development, test, production). |
| `.gitignore` | dosya | Git'in yok sayacağı dosya/klasörleri listeler. |
| `CLAUDE.md` | markdown | Proje‑özeli açıklamalar (Claude AI için). |
| `README.md` | markdown | Projenin tanıtımı, kurulum adımları, CI/CD linkleri vb. |
| `db‑schemas/` | klasör | PostgreSQL tablolarının SQL tanımları. Servis‑bazlı şemalar (`01‑identity‑schema.sql` gibi) bulunur; `combined‑schema.sql` tüm şemayı birleştirir. |
| `landing‑app/` | klasör | Statik ya da hafif ön‑yüz, mikro‑servis çalıştırmasının bir parçası değildir. |
| `packages/` | klasör | **Paylaşılan kütüphane**; kod tekrarını önler. |
| `services/` | klasör | Tüm mikro‑servislerin bulunduğu konteyner. Her alt klasör aynı yapıyı izler. |
| `package.json` (kök) | dosya | Kök düzeyindeki npm betikleri (`test:identity`, `lint`, `format` vb.) ve ortak bağımlılıklar. |
| `eslint.config.js` | dosya | Repo genelinde uygulanacak lint kuralları. |

---

### 3️⃣ Bir Servis Klasörünün İçin Detaylı Bakış (örnek: `service‑identity`)

```
service-identity/
├─ TEST_REHBERI.md            # Test rehberi
├─ TROPIQ_Identity_UserStories_v4_impl.md
├─ commit-and-tag-temp.js     # CI‑tagleme yardımcı betiği
├─ configs/
│   └─ app-config.js          # Servis‑özgü yapılandırma (port, env, …)
│   └─ datasource-config.js   # DB / cache ayarları
├─ definitions/
│   └─ rest-api-definition.js # OpenAPI (Swagger) tanımı – HTTP sözleşmesi
├─ middlewares/
│   └─ index.js               # Express ara‑yazılımları (auth, logging, error handling)
├─ src/
│   ├─ boot.js                # Servise özgü başlangıç (seed data vb.)
│   └─ … (controllers, services, models) 
├─ test/
│   ├─ unit/                  # Saf unit testler
│   ├─ integration/           # DB / dış servislere dokunan testler
│   └─ e2e/                   # Tam uç‑uç testler
├─ main.js                    # **Giriş noktası** – bütün bileşenleri birleştirir
└─ package.json               # Servise özgü npm meta‑verisi (name, version)
```

#### 3.1 `main.js` – Mikro‑servisin Kalbi

```js
import express from 'express';
import datasources, { createDatasources } from '../../packages/modules/datasource/index.js';
import appConfig, { createAppConfig } from '../../packages/modules/config/index.js';
import serviceDiscovery from '../../packages/modules/service-discovery/index.js';
import helper from '../../packages/modules/helper/index.js';
import rawAppConfig from './configs/app-config.js';
import rawDatasourceConfig from './configs/datasource-config.js';
import middlewareFactory from './middlewares/index.js';
import boot from './src/boot.js';
import openApi from './definitions/rest-api-definition.js';

async function initialize() {
  const app = express();

  // 1️⃣ Konfigürasyonu yükle (port, env, feature‑flagler)
  createAppConfig(rawAppConfig, rawDatasourceConfig);

  // 2️⃣ Prodüksiyon dışı ortamda detaylı loglama aktif et
  if (appConfig?.nodeEnv !== 'production') {
    global.logMode = 'trace';
  }

  // 3️⃣ DB & cache bağlantılarını başlat (PostgreSQL, Redis, …)
  await createDatasources(appConfig).catch(error => {
    console.error(error);
    helper.application.exitOnError();
  });

  // 4️⃣ Servisi **service‑discovery** kayıt defterine ekle
  const serviceDiscoveryInstance = await serviceDiscovery(
    app,
    openApi,
    datasources.serviceDiscoveryRedis,
    datasources.coreAppRedis,
  ).catch(error => {
    console.error(error);
    helper.application.exitOnError();
  });

  // 5️⃣ Global ara‑yazılımları (auth, validation, logging) ekle
  app.use(middlewareFactory(appConfig, serviceDiscoveryInstance, openApi));

  // 6️⃣ Bilinen tüm servislerin API'lerini yayınla (gateway‑pattern için)
  serviceDiscoveryInstance.setAllServiceApis(app).catch(error => {
    console.error(error);
    helper.application.exitOnError();
  });

  // 7️⃣ Config'te belirtilen portta dinlemeye başla
  app.listen(appConfig.port);
  helper.application.appStarted(appConfig);

  // 8️⃣ Servise özgü başlangıç adımları (seed data, background job vb.)
  await boot().catch(error => {
    console.error(error);
    helper.application.exitOnError();
  });
}

initialize();
```

**Kodun sade açıklaması**

| Adım | Ne oluyor? | Mikro‑servis açısından neden önemlidir? |
|------|------------|-----------------------------------------|
| **Konfigürasyon yükleme** | `configs/app-config.js` dosyasından port, ortam ve özellik flag'leri okunur. | Her servis kendi ayarlarını bağımsız olarak alır, fakat aynı loader paylaşılır. |
| **Datasource oluşturma** | PostgreSQL, Redis, Kafka gibi bağlantılar açılır. | Tüm servisler aynı veri depolarını paylaşabilir ya da kendi instance'larını kullanabilir. |
| **Service discovery** | Servis, Redis içindeki bir hash'e `service‑identity` adı, host, port ve OpenAPI tanımıyla kaydedilir. | Çalışma zamanında diğer servisler, adını vererek URL ve sözleşmeye erişir; URL'ler kodda sabitlenmez. |
| **Ara‑yazılımlar** | İstek doğrulama, güvenlik başlıkları, loglama vb. eklenir. | Ortak çapraz‑konular (cross‑cutting concerns) bütün servislerde tutarlı olur. |
| **API yayınlama** | `serviceDiscoveryInstance.setAllServiceApis(app)` diğer servislerin endpointlerini proxy olarak ekler. | Tek bir Express instance'ı API‑gateway gibi kullanılabilir. |
| **Port dinleme** | `app.listen(appConfig.port)` – servis belirtilen portta başlar. | Her mikro‑servis ayrı bir portta çalışır (3001, 3002 …). |
| **Boot** | `boot.js` içinde veri seedleme, arka plan işleri başlatılır. | Başlangıç mantığı servise özgüdür ve ayrı bir dosyada tutulur. |

Diğer servislerde (`service‑analytics`, `service‑audit`, `service‑bidding` vb.) `main.js` aynı şablonu izler; yalnızca `configs/*` dosyaları farklıdır.

---

### 4️⃣ Monorepo’da Mikro‑servis Mimarisi Nasıl Çalışır?

1. **Klasör izolasyonu** – Her servis kendi `package.json` dosyasına sahiptir. Böylece `npm install` / `npm run test` sadece o servise uygulanır.
2. **Ortak modüller** (`packages/modules/`) – Config loader, datasource factory, helper ve service‑discovery tek bir yerde tanımlanır; servisler `../../packages/modules/...` yolu ile import eder.
3. **Service‑discovery (Redis)** – `service-discovery` modülü, servis adını, host‑u, port‑u ve OpenAPI tanımını Redis hash'ine yazar. Diğer servisler bu hash'i okuyarak dinamik URL elde eder.
4. **OpenAPI sözleşmeleri** – Her servis `definitions/rest-api-definition.js` içinde kendi Swagger tanımını tutar. Kayıt sırasında bu tanım da Redis'e eklenir; böylece istemci kodu otomatik olarak tip‑güvenli hâle getirilebilir.
5. **Servis‑bazlı veri şemaları** – `db‑schemas/` klasöründe servis‑özel SQL dosyaları bulunur; `combined‑schema.sql` tüm şemaları birleştirir. Böylece veri bağımlılığı minimuma indirilir.
6. **Test stratejisi** – Her servis `test/` içinde `unit`, `integration` ve `e2e` test katmanlarına sahiptir. Kök `package.json` ilgili betiği (`npm run test:identity`) sadece istenen servisin testlerini çalıştırır.
7. **Process yönetimi** – Gerçek ortamda `PM2`, Docker‑Compose ya da Kubernetes tercih edilir. Repo içinde `ecosystem.config.js` dosyaları PM2 için hazırlanmıştır (`pm2 start ecosystem.config.js`).
8. **CI/CD** – `README.md` GitLab CI/CD bağlantılarını referans verir. Her servis bağımsız olarak lint, test ve build adımlarını paralel çalıştırabilir.

---

### 5️⃣ Yeni Başlayanlar İçin Hızlı “Nasıl‑Yapılır” Kılavuzu

| Amaç | Komut (repo kökünden) | Açıklama |
|------|-----------------------|----------|
| Tüm bağımlılıkları kur | `npm install` | Kök ve servis bağımlılıkları `node_modules/` içine kurulur; workspace yapısı sayesinde paylaşılır. |
| Tek bir servisi yerel çalıştır (örnek: identity) | `node services/service-identity/main.js` | `services/service-identity/configs/app-config.js` içinde tanımlı portta Express server başlatılır. |
| Tüm servisleri PM2 ile başlat (geliştirme) | `pm2 start services/*/ecosystem.config.js` | Her servis `ecosystem.config.js` dosyasını okuyarak arka planda çalışır. |
| Sadece identity servisinin birim testlerini çalıştır | `npm run test:identity` | Kök `package.json` içinde tanımlı; `services/service-identity/test/unit` içindeki `*.test.js` dosyalarını bulur. |
| Bir servisin OpenAPI tanımını incele | `services/<servis>/definitions/rest-api-definition.js` dosyasını aç. | Swagger tanımı JSON/JS objesi olarak bulunur; Swagger‑UI ile görselleştirilebilir. |
| Yeni bir mikro‑servis ekle | 1. `mkdir services/service-new` <br>2. İstediğiniz bir servisin klasör yapısını (örnek: `service-identity`) kopyalayın <br>3. `package.json` içindeki isim, port ve OpenAPI tanımını güncelleyin. | Tüm servisler aynı bootstrap kodunu paylaştığı için sadece konfigürasyonları ve iş mantığını eklemeniz yeterlidir. |
| Veritabanını bir kez seedle | `psql -f db-schemas/combined-schema.sql` | Tek komut tüm tabloları oluşturur ve `10‑seed-data.sql` içindeki başlangıç verilerini ekler. |

---

### 6️⃣ TL;DR – Bu Monorepo’nun Mikro‑servis Özellikleri

| Özellik | Repo içinde nasıl görülür |
|----------|---------------------------|
| **Bağımsız dağıtım birimleri** | `services/<servis>` klasörleri; her biri ayrı paket, Docker imajı veya PM2 süreci olarak dağıtılabilir. |
| **Zayıf bağlılık** | Servisler sadece HTTP + OpenAPI sözleşmesi üzerinden iletişim kurar; birbirlerinin koduna doğrudan import yapılmaz. |
| **Paylaşılan kütüphaneler** | `packages/modules/` – config, datasource, helper, service‑discovery gibi ortak kodları barındırır. |
| **Çalışma‑zamanı keşfi** | `service-discovery` modülü Redis içinde servis adlarını ve URL'lerini saklar; diğer servisler bu veriyi sorgular. |
| **Kendi veri deposu** | `db‑schemas/` içindeki servis‑özgü `.sql` dosyaları; her mikro‑servisin tablosu kendi sorumluluğundadır. |
| **İzolasyonlu testler** | Her servis kendi `test/` klasörüne sahiptir; CI bu testleri paralel çalıştırabilir. |
| **Tek repo, çok pipeline** | Tek Git repository, fakat CI/CD her servisin lint, test ve build adımlarını ayrı pipeline olarak yürütür. |

---

## 📚 Sonraki Adımlar

* **`packages/modules/`** – `config/index.js`, `datasource/index.js` ve `service-discovery/index.js` dosyalarını inceleyerek ortak yardımcıların nasıl çalıştığını görün.
* **`services/<servis>/definitions/`** – OpenAPI spec'lerini okuyarak her servisin dışa sunduğu API'yi anlayın.
* **`services/<servis>/test/`** – Unit, integration ve e2e testlerini keşfederek kod kalitesinin nasıl korunduğunu görün.

Herhangi bir dosyanın derinlemesine açıklamasını, **Redis‑tabanlı service‑discovery** kodunun detaylarını veya **Docker‑Compose** örnek yapılandırmasını görmek isterseniz, sadece söyleyin; hemen size sunuyorum!
