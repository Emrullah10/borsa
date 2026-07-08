
# account-web-gateway — Sıfırdan Anlama Rehberi: Bir API Gateway'in Anatomisi

> Bu yazı, "gateway nedir, neden var, bu dosyalar ne iş yapar?" sorularını hiç bilmeden okuyan birine tüm cevapları vermek için yazılmıştır. Her klasör, her dosya tek tek açıklanır.

---

## Önce Şunu Anla: Gateway Nedir ve Neden Var?

Hayal et: elinizde birden fazla backend servisi var.

```
Frontend (React App)
       │
       ├──► account-iam-service   (kullanıcı, rol, poliçe, banka...)
       ├──► account-meter-service (sayaç, ölçüm...)
       └──► account-entity-service (cihaz, birim...)
```

Eğer frontend bu servislere **direkt** bağlansa ne olur?

- Her servisin adresini frontend bilmek zorunda kalır
- Token doğrulama her serviste ayrı ayrı yapılır
- CSRF koruması, SQL injection, XSS koruması her serviste tekrarlanır
- Frontend production'da farklı portlara, farklı URL'lere bağlanır — güvenlik deliği

**Çözüm: API Gateway.** Tek bir kapı, tek bir adres. Frontend sadece gateway'i bilir, gateway arkaya yönlendirir.

```
Frontend
   │
   ▼
account-web-gateway  ←── tek giriş noktası
   │  (JWT doğrulama, CSRF, SQL injection koruması, izin kontrolü hepsi burada)
   │
   ├──► account-iam-service
   ├──► account-meter-service
   └──► account-entity-service
```

---

## Proje Yapısı — Genel Görünüm

```
account-web-gateway/
├── main.js                  ← Uygulamanın başladığı yer
├── package.json             ← Bağımlılıklar ve scriptler
├── private.pem              ← JWT imzalama için RSA özel anahtar
├── public.pem               ← JWT doğrulama için RSA açık anahtar
├── .env                     ← Ortam değişkenleri (gizli)
├── deploy.sh                ← Deploy scripti
├── commit-and-tag.js        ← Otomatik git versiyon etiketi
├── eslint.config.js         ← Kod kalite kuralları
│
├── configs/                 ← Uygulama konfigürasyonu
│   ├── app-config.js
│   └── datasource-config.js
│
├── definitions/             ← OpenAPI dokümantasyonu
│   └── rest-api-definition.js
│
├── routes/                  ← Gateway'in kendi route'ları
│   └── rest-routes.js
│
├── src/                     ← Ana iş mantığı
│   ├── boot.js              ← Başlatma ve servis kaydı
│   ├── route.js             ← Proxy yönlendirme
│   ├── constants/           ← Sabit değerler
│   ├── middlewares/         ← Güvenlik katmanları
│   ├── modules/             ← Yardımcı araçlar
│   └── utils/               ← Token işlemleri
│
└── packages/                ← Tekrar kullanılabilir core modüller
    ├── constants/
    └── modules/
        ├── config/
        ├── datasource/
        ├── errors/
        ├── helper/
        ├── language/
        └── service-discovery/
```

---

## 1. main.js — Her Şeyin Başladığı Yer

Bu dosya Node.js'in çalıştırdığı ilk dosyadır. `initialize()` fonksiyonu şu sırayla çalışır:

```
1. Express app oluştur
2. Global araçları yükle (log, config, errors)
3. Redis bağlantılarını kur (2 adet: uygulama + servis keşfi)
4. Service Discovery'yi başlat (Redis'ten diğer servisleri bul)
5. boot.js'i çağır (middleware'leri ve proxy route'larını ekle)
6. Express sunucuyu belirtilen port'ta dinlemeye başlat
```

Kritik detay: `global.log`, `global.config`, `global.datasources`, `global.errors` burada **global** değişken olarak atanır. Yani projenin her yerinden `global.config.port` gibi erişilebilir — ayrıca import etmeye gerek yok.

```js
global.log = corePackages.helper.log;
global.config = corePackages.config(appConfig, datasourceConfig);
global.datasources = await corePackages.datasource.createDatasources(global.config);
```

Son satırda sunucu başlatılır:
```js
express.listen(global.config.port, () => console.log('API_GATEWAY_READY on Port: ', global.config.port));
```

---

## 2. configs/ — Konfigürasyon

```
configs/
├── app-config.js
└── datasource-config.js
```

### configs/app-config.js

Uygulamanın tüm ayarları burada tanımlanır. Her alan için `default` (varsayılan) ve `env` (ortam değişkeni adı) belirtilebilir. `12factor-config` kütüphanesi bu yapıyı okur ve ortam değişkenlerini öncelikli olarak kullanır.

| Alan | Açıklama |
|------|---------|
| `url` | Gateway'in dışarıya açık adresi (`ACCOUNT_GATEWAY_REST_URL` env'den) |
| `basePath` | `/account-web-gateway` — tüm route'ların öneki |
| `basePathPrefix` | `/api` — URL yapısı: `/api/account-web-gateway/...` |
| `nodeEnv` | `development` / `production` / `test` |
| `validateRequests` | OpenAPI şema doğrulaması açık/kapalı |
| `remoting.json.limit` | JSON body max boyutu: 100MB |

### configs/datasource-config.js

Gateway'in bağlandığı **iki Redis instance'ı** burada tanımlanır:

```js
[
  {
    name: "coreAppRedis",          // Uygulama geneli cache
    type: "redis",
    url: env("CORE_REDIS_URL"),
  },
  {
    name: "serviceDiscoveryRedis", // Servis keşfi + token saklama
    type: "redis",
    url: env("CORE_DISCOVERY_REDIS_URL"),
  }
]
```

**Neden iki Redis?** `coreAppRedis` genel amaçlı cache için, `serviceDiscoveryRedis` ise hem servis bilgilerini saklamak hem de Pub/Sub mesajlaşma için kullanılır. İkisi birbirine karışmamalı.

---

## 3. src/ — Gateway'in Beyni

### src/boot.js — Başlatma ve Dinamik Rota Kaydı

Bu dosya, gateway'in en akıllı parçasıdır. `main.js` tarafından çağrılır ve şunları yapar:

**1. Servis listesini Redis'ten çek:**
```
serviceDiscovery.discoverAllServices()
→ Redis'te kayıtlı tüm servislerin route bilgilerini al
```

**2. Global servis listesini oluştur:**
`setServiceList(services)` fonksiyonu, tüm route'ları şu formatta bir nesneye yazar:
```
"get/api/account-iam-service/v1/users" → { method, basePath, path, rootUrl, permission }
```
Bu nesne izin kontrolü için kullanılır.

**3. Proxy route'larını ekle:**
Her servis için `route.reRoute(app, service)` çağrılır. Bu, gateway'e "bu path'e gelen isteği şu adrese yönlendir" der.

**4. Servis yeniden başlatma bildirimi dinle:**
```js
serviceDiscovery.subscribeServiceDiscoveryRedis('account.fct.servicerestarted', (channel, message) => {
    refreshRoute(app, data, serviceDiscovery);
});
```
Herhangi bir servis yeniden başladığında Redis Pub/Sub kanalından bildirim alınır ve gateway route'larını **otomatik olarak günceller** — gateway'i yeniden başlatmaya gerek kalmaz.

**`refreshRoute` fonksiyonu ne yapar?**
Eski route'ları Express'in router stack'inden siler, yeni route'ları ekler. Canlı sistemde sıfır kesinti ile route güncelleme.

---

### src/route.js — Proxy Yönlendirme

İki fonksiyon export eder:

**`reRoute(app, service)`**
Her servis için proxy bağlantısı kurar.
- `/account-iam-service` path'i için login endpoint'i **CSRF koruması olmadan** eklenir (login henüz token almadığı için CSRF token'ı olamaz)
- Diğer tüm path'ler CSRF korumasıyla eklenir

```js
if (service.basePath == '/account-iam-service') {
  app.use(`${path}/v1/login`, proxy(service.rootUrl)); // CSRF yok
}
return app.use(path, csrfProtection, proxy(service.rootUrl)); // CSRF var
```

**`addGatewayRoutes(app)`**
Gateway'e özgü tek route: `/api/gateway/refresh`
Token yenileme isteği bu endpoint'e gelir, `refreshTokenService` ile yeni token üretilir.

---

### src/middlewares/ — Güvenlik Katmanları

Bu klasör gateway'in kalkan sistemidir. Her istek önce bu katmanlardan geçer.

```
middlewares/
├── index.js                        ← Middleware listesini oluşturur
├── middleware-list-middleware.js   ← Sıralı middleware listesi + JWT doğrulama
├── security-middleware.js          ← CORS, XSS, SQL injection
├── helmet-middleware.js            ← HTTP güvenlik başlıkları
├── compression-middleware.js       ← Gzip sıkıştırma
├── cookie-parser.js                ← Şifreli cookie okuma
├── check-url-middleware.js         ← URL bazlı özel işlemler
├── body-parser-json-middleware.js  ← JSON body parse
├── body-parser-url-encode-middleware.js ← Form body parse
├── http-proxy-middleware.js        ← Asıl proxy mantığı
└── log-middleware.js               ← İstek loglama
```

#### src/middlewares/index.js
`middlewareFactory(config)` — middleware listesini konfigürasyondan geçirir ve sıralı array olarak döner. `app.use(middleware)` ile tüm liste bir anda Express'e eklenir.

#### src/middlewares/middleware-list-middleware.js — En Kritik Dosya

Middleware'lerin çalışma sırası burada belirlenir:

```
1. cors               ← Farklı domainlerden istek izni
2. cookieParser       ← Cookie'leri oku ve imzalı olanları doğrula
3. xss                ← XSS saldırılarını temizle
4. sqlInjectionMiddleware ← SQL enjeksiyon girişimlerini engelle
5. compression        ← Yanıtları sıkıştır
6. helmet             ← Güvenlik HTTP başlıkları ekle
7. checkUrl           ← URL bazlı kontroller
8. authenticateJwt    ← JWT token doğrulama + izin kontrolü
```

**`authenticateJwt` — Gateway'in Bekçisi:**

```
İstek geldi
│
├── /login veya /signup veya /openapi-ui/ → geç (doğrulama yok)
│
└── Diğer tüm istekler:
    ├── refreshToken cookie'yi al
    ├── JWT ile imzayı doğrula (RSA public key ile)
    ├── checkUserPermission() → bu endpoint için izin var mı?
    ├── /logout ise → Redis'ten token'ı sil, cookie'leri temizle
    └── Diğer: accessToken'ı doğrula, yeni token üret, devam et
```

**`checkUserPermission` — İzin Kontrolü:**

URL'den hangi endpoint'e istek yapıldığı tespit edilir. Global `serviceList` nesnesinden bu endpoint'in gereken izni (`permission`) bulunur. Token içindeki `userPermissionList` bu izni içeriyorsa geçilir, içermiyorsa `401 Unauthorized`.

#### src/middlewares/security-middleware.js

Üç güvenlik katmanı:

**`cors`** — Hangi domainlerin istek yapabileceğini kontrol eder. Farklı originlerden gelen istekleri kabul/red eder.

**`xss` (xss-clean)** — Request body, query ve param'lardaki `<script>` gibi HTML/JS etiketlerini otomatik temizler.

**`sqlInjectionMiddleware`** — Body, query ve param değerlerini regex ile tarar:
```js
/('|;|--|\b(SELECT|UPDATE|DELETE|INSERT)\b)/gi
```
Bu pattern'e uyan istek anında `403 Forbidden` döner.

Not: `rateLimit` (hız sınırlama) kodu yazılmış ama şu an yoruma alınmış.

#### src/middlewares/helmet-middleware.js

`helmet()` kütüphanesi Express'e HTTP güvenlik başlıkları ekler:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security`
- `X-XSS-Protection`
- Ve daha fazlası — tarayıcı seviyesinde birçok saldırıyı önler.

#### src/middlewares/cookie-parser.js

Cookie'leri parse eder ve imzalı cookie'leri doğrular. İmzalama secret'i hardcode edilmiş:
```js
cookieParser("1y289y3ryı3ey8e13r932h")
```
`req.signedCookies.token` gibi erişimler bu middleware sayesinde çalışır.

#### src/middlewares/compression-middleware.js

Tüm HTTP yanıtlarını Gzip ile sıkıştırır. Özellikle büyük JSON listelerinde bant genişliği tasarrufu sağlar.

#### src/middlewares/check-url-middleware.js

URL'ye göre özel işlem yapma katmanı. `encodeBcrypt` fonksiyonu şifreyi hash'leme için yazılmış ama şu an aktif değil. Yapı şöyle: login/signup ise geç, diğerleri de geç — ileride genişletilebilir bir yer tutucu.

#### src/middlewares/body-parser-json-middleware.js ve body-parser-url-encode-middleware.js

İstek gövdesini parse eder:
- JSON formatındaki istekler için `bodyParser.json()` — limit: 100MB
- HTML form formatındaki istekler için `bodyParser.urlencoded()` — limit: 100MB

#### src/middlewares/log-middleware.js

Her isteği loglar: method, URL, IP adresi. Şu an middleware listesinde yoruma alınmış (TODO).

#### src/middlewares/http-proxy-middleware.js — Proxy'nin Kalbi

`createProxyMiddleware` ile gerçek proxy bağlantısı kurulur. İki kritik hook:

**`onProxyReq` — İstek backend'e gitmeden önce:**

```
1. X-Frame-Options başlığını temizle
2. tenantcode ve organizationid header'larını ekle (makroApp / 1)
3. /openapi-ui/ isteği ise → apikey kontrolü yap
4. GET/HEAD/OPTIONS isteği ise → CSRF kontrolü yok, geç
5. Login/signup değilse ve CSRF token yoksa → 403 döndür
```

**`onProxyRes` — Backend'den yanıt döndükten sonra:**

```
1. /signup yanıtı → olduğu gibi geçir
2. GET/HEAD/OPTIONS yanıtı → XSRF-TOKEN cookie'sini set et
3. /login yanıtı:
   - Backend'den gelen yanıtı parse et
   - Hata varsa → olduğu gibi geçir
   - Başarılıysa:
     a. userId ve userPermissionList al
     b. createToken() ile JWT oluştur
     c. Cookie'lere yaz (httpOnly, signed, sameSite=strict)
     d. Yanıtta userPermissionList'i düzenle
4. Diğer yanıtlar → olduğu gibi geçir
```

---

### src/utils/token.js — JWT Token Yönetimi

Gateway'in en güvenlik hassas dosyası.

**RSA Asimetrik Şifreleme:**
```
private.pem → Token OLUŞTURMAK için (sadece gateway bilir)
public.pem  → Token DOĞRULAMAK için (servisler de kullanabilir)
```

Neden RSA? Simetrik (secret key) yerine asimetrik kullanmak, backend servislerinin token'ı doğrulamasına ama oluşturamamasına imkan verir.

**`createToken({ payload, response })`**

İki ayrı token oluşturur:

| Token | Süre | Kullanım |
|-------|------|---------|
| `accessToken` | 2880 dakika (48 saat) | Her istekte kimlik doğrulama |
| `refreshToken` | 1440 dakika (24 saat) | Yeni token almak için |

Her ikisi de `httpOnly: true, signed: true, sameSite: 'strict', secure: true` ayarlı cookie olarak yazılır. JavaScript'ten okunamaz — XSS saldırısına karşı.

Token aynı zamanda Redis'e yazılır:
```
key: token_freq_web:{userId}:{refreshToken}
```
Yeni token oluşturulduğunda kullanıcının eski token'ları silinir (wildcard delete). Böylece bir kullanıcı aynı anda sadece bir aktif session'a sahip olur.

**`refreshTokenService({ req, res, next })`**

`/api/gateway/refresh` endpoint'i bu fonksiyonu çağırır:
1. `req.signedCookies.refreshToken` al
2. RSA public key ile doğrula
3. Geçerliyse yeni accessToken + refreshToken oluştur
4. `{ status: "success" }` döndür

**`deleteTokenFromRedis(id, guid)`**

Logout sırasında Redis'ten token silinir. Bu sayede çalınmış bir token bile logout sonrası geçersiz hale gelir.

---

### src/constants/

Üç dosya, şu an boş:

- **error.js** — Hata kod sabitleri (henüz doldurulmamış)
- **redis.js** — Redis anahtar sabitleri (henüz doldurulmamış)
- **index.js** — İkisini export eder

Gelecekte `INVALID_TOKEN`, `SESSION_EXPIRED` gibi sabitler buraya gelecek.

### src/modules/utils.js — Yardımcı Araçlar

Bu dosya aslında gateway'den çok backend servislerinde kullanılan utility fonksiyonlarını içerir ama core modül olarak burada da bulunur:

| Fonksiyon | Ne Yapar |
|-----------|---------|
| `safeJSONStringify(obj)` | Error nesnelerini de JSON'a çevirir |
| `safeJSONParse(str)` | Parse hatası verirse `undefined` döner |
| `convertObjectToCamelCase(obj)` | `user_name` → `userName` dönüşümü |
| `prepareDynamicWhere` | PostgreSQL WHERE clause builder |
| `QueryBuilder` | Fluent API ile SQL sorgu oluşturma class'ı |
| `formatHierarchyTree` | İç içe ağaç yapısını düzenler |

**`QueryBuilder` class'ı** özellikle dikkat çekicidir:
```js
new QueryBuilder({ tableName: 'users', tenant: 'makro' })
  .select('id', 'name')
  .where({ id: 5 })
  .done()
// → { script: "select id, name from makro.users where id = $1;", parameters: [5] }
```

---

## 4. packages/ — Core Modüller

Bu klasör, gateway servisinin "shared library" katmanıdır. Aynı modüller `account-iam-service` gibi diğer servislerde de bulunur — kodun tekrarını önlemek için ayrı tutulmuş bir yapı.

```
packages/
├── constants/                 ← Hata sabitleri
└── modules/
    ├── config/                ← 12-factor konfigürasyon
    ├── datasource/            ← Veritabanı bağlantıları
    ├── errors/                ← Hata yönetimi
    ├── helper/                ← Log ve uygulama araçları
    ├── language/              ← Query dil katmanı
    └── service-discovery/     ← Servis keşfi motoru
```

### packages/modules/config/index.js

`12factor-config` kütüphanesini kullanır. `app-config.js`'ten gelen şema ile ortam değişkenlerini birleştirir:

- `default` varsa onu kullan
- `env` belirtilmişse ve ortam değişkeni mevcutsa onu kullan (öncelik)
- `type: 'boolean'` gibi type dönüşümlerini otomatik yap
- `type: 'enum'` ise geçerli değerlerden biri olmak zorunda

### packages/modules/datasource/ — Veritabanı Fabrikası

**index.js** — Singleton pattern ile datasource yönetimi:

```
createDatasources(config)
  → Her datasource config'i için:
     ├── type: 'redis'   → Redis bağlantısı oluştur
     ├── type: 'postgre' → PostgreSQL bağlantısı oluştur
     ├── type: 'kafka'   → Kafka consumer/producer oluştur
     └── type: 'rest'    → REST client oluştur
  → { coreAppRedis: ..., serviceDiscoveryRedis: ... } döner
```

**connectors/redis.js** — ioredis ile Redis bağlantısı:
- `retryStrategy` ile bağlantı kesilince üstel geri çekilme (max 15 saniye)
- `default` db 0, `dataChange` db 1 (farklı veritabanı numaraları)
- `letsPool()` ile bağlantı nesnesi döner

**connectors/postgre.js** — PostgreSQL bağlantısı (gateway'de şu an kullanılmıyor ama modül hazır)

**connectors/kafka.js** — Kafka consumer/producer (gelecek için hazır)

**connectors/rest.js** — REST API client connector

**connectors/util.js** — Redis/DB URL'lerini host:port formatına çevirme yardımcısı

### packages/modules/errors/ — Hata Yönetimi

**handleErrors.js** — Express global hata yakalayıcı. `HTTP_STATUS` kodlarına göre yanıt döner.

**responses/** — Standart HTTP yanıt formatları:
- `error-response.js` — Hata yanıtı formatı
- `successful-response.js` — Başarı yanıtı formatı
- `custom-reponse.js` — Özel yanıt formatı
- `responses.js` — Hepsini toplar

**messages.js** — Hata mesajı sabitleri

`unRoutedRouteErrorHandler(app)` — Tanımlanmamış route'lara gelen isteklere `404` döner.

### packages/modules/helper/ — Uygulama Araçları

**index.js** — `application` nesnesi:
- `exitOnError(error)` — Kritik hata gelince süreci düzgünce kapat
- `appStarted(config)` — Uygulama başarıyla başladığında log yaz

**log/index.js** — `safeJsonStringify`, `checkLoglevel`, `addDateAndModeToLog` — structured logging altyapısı. `global.log.info(...)` buradan gelir.

**internals/index.js** — `internalHeader` — servisler arası internal çağrılarda kullanılan header değerleri.

### packages/modules/service-discovery/ — Servis Keşfi Motoru

Gateway'in en karmaşık modülü. Mikroservislerin birbirini bulması ve tanıması için Redis tabanlı bir kayıt sistemi.

**index.js** — `init(router, openApi, serviceDiscoveryRedis, coreAppRedis)` fonksiyonu şu yetenekleri sağlar:

**Servis Kayıt Fonksiyonları:**

| Fonksiyon | Ne Yapar |
|-----------|---------|
| `setAllServiceApis(router)` | Tüm route'ları Redis'e yaz, Express'e ekle |
| `setServiceApi(key, element)` | Tek route'u Redis'e yaz ve Express'e ekle |
| `addServiceRoute(element)` | Sadece Express'e ekle |
| `addHealthCheckApi(...)` | `/online` health check endpoint'i ekle |

**Servis Keşif Fonksiyonları:**

| Fonksiyon | Ne Yapar |
|-----------|---------|
| `discoverAllServices()` | Redis'teki tüm `service:*` key'lerini tara |
| `discoverService(serviceKey)` | Tek servisin bilgisini `hgetall` ile oku |
| `getAllServiceKeys()` | `SCAN` komutu ile key'leri listele |

**Pub/Sub:**
`subscribeServiceDiscoveryRedis(channel, cb)` — Redis'in `SUBSCRIBE` komutunu kullanarak `account.fct.servicerestarted` kanalını dinler. Bir servis yeniden başlayınca bu kanalda mesaj yayınlar, gateway bu mesajı alarak route'larını günceller.

**Heartbeat:**
`giveHeartBeat()` her 3 saniyede bir `health:{serviceName}` key'ine timestamp yazar. Bu sayede gateway ve diğer servisler, bir servisin canlı olup olmadığını Redis'ten anlayabilir.

**modules/helper.js** — `prepareServiceInfo(openApi, serviceDiscovery)`: OpenAPI YAML/JSON tanımından route listesi oluşturur.

**modules/validation.js** — Route eklenmeden önce zorunlu alanları doğrular.

**modules/core-end-points.js** — `apiMetrics`, `apiInfo`, `healthCheck` gibi standart endpoint'leri her servise otomatik ekler.

### packages/modules/language/ — Query Dil Katmanı

Kafka üzerinden sorgu çalıştırma ve graph query abstraksiyonu. Gateway bu katmanı doğrudan kullanmaz ama modül olarak paketlenmiş:

- `language.js` — Sorgu dil tanımları
- `kafka-works.js` — Kafka üzerinden asenkron sorgu
- `graph-query.js` — Graph veritabanı sorgu formatı

---

## 5. definitions/ — API Dokümantasyonu

### definitions/rest-api-definition.js

OpenAPI 3.0 şeması. Gateway'in kendi endpoint'lerini tanımlar. `paths: {}` şu an boş — gateway kendi endpoint'lerini dinamik olarak değil, servislerden proxy'leyerek sunar. `components.schemas` altında `PostLoginRequest`, `PostLoginResponse` gibi paylaşılan şema tanımları var.

Bu dosya `main.js`'te `openApi` adıyla import edilir ve Service Discovery modülüne verilir. Servis keşfi sırasında bu OpenAPI belgesi Redis'e kaydedilir.

---

## 6. routes/ — Gateway'in Kendi Route'ları

### routes/rest-routes.js

Neredeyse boş:
```js
const routerFunctions = {};
export default routerFunctions;
```

Gateway kendi endpoint'leri için henüz özel route function'ı tanımlamamış. Tüm yönlendirme proxy üzerinden yapılıyor. İleride gateway'e özgü endpoint'ler buraya gelecek.

---

## 7. Güvenlik Sertifikaları

### private.pem ve public.pem

RSA-256 anahtar çifti. JWT imzalama için:

```
private.pem → Sadece gateway okur, token OLUŞTURUR
public.pem  → Gateway ve backend servisler, token DOĞRULAR
```

Bu dosyalar `.gitignore`'da olmalı — production'da secret yönetim sisteminden (Vault, K8s Secret vb.) sağlanmalı.

---

## 8. Dağıtım Dosyaları

### deploy.sh
Git pull, build ve restart adımlarını otomatikleştirir.

### commit-and-tag.js
`npm version patch` ile versiyon artırır, git commit atar ve tag oluşturur. `prebuild` ve `build` scriptleri bunu tetikler.

### .env
Tüm ortam değişkenleri burada: `CORE_REDIS_URL`, `CORE_REDIS_PASSWORD`, `CORE_DISCOVERY_REDIS_URL`, `NODE_ENV` vb.

---

## 9. İstek Akışı — Büyük Resim

Kullanıcı "Poliçeler" sayfasını yüklemek için API isteği attığında tam olarak ne olur:

```
[1] Frontend → GET /api/account-iam-service/v1/policies

[2] Gateway'e gelir
    ├── cors         ✓ izin var
    ├── cookieParser ✓ cookie'leri oku
    ├── xss          ✓ temiz
    ├── sqlInjection ✓ temiz
    ├── compression  ✓ hazır
    ├── helmet       ✓ güvenlik header'ları eklendi
    ├── checkUrl     ✓ geç
    └── authenticateJwt:
        ├── refreshToken cookie al
        ├── RSA public key ile doğrula
        ├── checkUserPermission:
        │   ├── serviceList["get/api/account-iam-service/v1/policies"] bul
        │   └── tokenPayload.userPermissionList içinde gerekli izin var mı?
        ├── accessToken'ı da doğrula
        ├── Yeni token üret → cookie'yi yenile
        └── next() → devam

[3] route.js'e gelir
    └── csrfProtection → CSRF token geçerli mi?

[4] http-proxy-middleware.js
    └── onProxyReq:
        ├── tenantcode: "makroApp" header ekle
        ├── organizationid: "1" header ekle
        └── isteği account-iam-service'e yönlendir

[5] account-iam-service
    └── /v1/policies endpoint'i işler, veri döner

[6] onProxyRes:
    ├── GET isteği → XSRF-TOKEN cookie'sini güncelle
    └── yanıtı frontend'e ilet

[7] Frontend yanıtı alır → AG Grid tabloya basar
```

---

## 10. Mimari Özet: Ne Nerede?

| Konu | Konum |
|------|-------|
| **Uygulama başlangıcı** | `main.js` |
| **Port ve URL ayarları** | `configs/app-config.js` |
| **Redis bağlantı ayarları** | `configs/datasource-config.js` |
| **JWT token oluşturma/doğrulama** | `src/utils/token.js` |
| **RSA anahtarları** | `private.pem` + `public.pem` |
| **Middleware zinciri sırası** | `src/middlewares/middleware-list-middleware.js` |
| **CORS, XSS, SQL injection** | `src/middlewares/security-middleware.js` |
| **Proxy yönlendirme mantığı** | `src/middlewares/http-proxy-middleware.js` |
| **CSRF koruması + proxy route'ları** | `src/route.js` |
| **Token yenileme endpoint** | `src/route.js` → `addGatewayRoutes` |
| **Dinamik servis başlatma** | `src/boot.js` |
| **Servis keşfi motoru** | `packages/modules/service-discovery/` |
| **Redis bağlantı fabrikası** | `packages/modules/datasource/` |
| **OpenAPI dokümantasyonu** | `definitions/rest-api-definition.js` |
| **Hata yönetimi** | `packages/modules/errors/` |

---

> **Tek cümle özet:** `account-web-gateway`, frontend ile backend servisler arasında duran, JWT doğrulama, CSRF koruması, SQL injection/XSS engelleme, izin kontrolü ve dinamik proxy yönlendirme yapan güvenlik ve yönlendirme katmanıdır — backend servisler sadece kendi işlerini yapabilir, güvenlik bütünü bu katmana bırakılmıştır.
