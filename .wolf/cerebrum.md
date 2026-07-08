# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-05-31

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

## Key Learnings

- **Project:** borsa

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

[2026-06-01] Birim testlerde producer fonksiyonun çıktısını ELLE uydurma. setup-builder testleri `{direction:'long', ...}` objesini manuel kurduğu için buildSetup'ın `direction` alanını döndürmediği gözden kaçtı; simulateTrade her zaman short dalına düştü → backtest PF negatif. Tüketici testleri (simulateTrade) gerçek üretici (buildSetup) çıktısıyla beslenmeli ya da producer'ın sözleşmesi ayrıca test edilmeli. Birim testler geçerken entegrasyon kopabilir.

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->

**[2026-07-08] Monorepo mimari taşıması (Tropiq şablonu):**
Proje `backend/` + `frontend/` iki-blok yapısından, kök seviyede `core/ services/ packages/ db-schemas/ web-app/` yapısına taşındı (bkz. `~/MONOREPO-ARCHITECTURE-TEMPLATE.md`). Her Node servisi (signal-engine, market-data, tracker, notifier, backtest) framework-free `core/service-X` (domain/application/infrastructure) + composition-root `services/service-X` (main.js→boot.js→container.js) olarak ikiye bölündü; datasource singleton'ları (`import datasources from '@borsa-bot/datasource'`) dependency-injection factory'lere (`make*({ db })`) çevrildi. service-ai (Python) dokunulmadı — 3 dosyalık bir serviste core split seremoni olurdu. Frontend `web-app/src/{features,pages,layouts,shared,styles}` yapısına taşındı, `@api @features @layouts @pages @shared @store @styles` path alias'ları eklendi (vite.config.js resolve.alias + jsconfig.json). Router/React Query gibi yeni kütüphane eklenmedi — saf taşıma. Migration sırasında iki gerçek kırık cross-service import bulundu ve düzeltildi (bkz. buglog: bug-tracker-broken-import, bug-backtest-broken-import) — her ikisi de bir servisin başka bir servisin `src/` içine relative path ile girmesinden kaynaklanıyordu; artık hepsi paylaşılan `@borsa-bot/core-*` workspace paketleri üzerinden.

**[2026-06-27] SignalCard flip animasyonu + dinamik içerik yüksekliği:**
Front yüz `position: absolute` iken içerik 280px'i aşınca kartlar üst üste bindi. Çözüm: front yüz `position: relative` yapılır (yükseklik içeriğe göre büyür), back yüz `position: absolute` + `height: 100%` ile front'un yüksekliğini alır. Flip animasyonu bozulmaz. `minHeight` sabit değer KULLANMA — içeriğe bırak.

## Key Learnings

- **Bitget WS API v2:** `WebsocketClientV2` (not V3), `instType` = `'USDT-FUTURES'` (not `'UMCBL'`) for futures subscriptions
- **Bitget WS public channels:** `candle1m/5m/15m`, `funding-rate`, `open-interest`, `account-ratio` — no API key needed
- **Local Redis:** Native Redis runs at 6379 on this machine; Docker Redis container not needed
- **Native Postgres:** Available at localhost:5432; botuser/botpass/borsabot DB created for borsa-bot
- **borsa-bot monorepo:** At ~/developer/fullStack/borsa-bot, feature branch feature/phase1a, worktree at .worktrees/phase1a
- **Ollama on this machine:** M2 Pro 16GB, qwen2.5:7b installed — use for AI guard layer (throttled, not hot-path)

## User Preferences

- Scalp trader (1m-15m timeframes) on Bitget futures with leverage
- Wants signal/recommendation mode first (no auto-trading yet)
- Prefers monorepo pattern matching tropiq structure
- Node.js backend, React frontend, Python only for AI/ML
- Turkish is preferred language for communication

## Do-Not-Repeat

- [2026-06-01] Bitget SDK metodları: `getHistoricCandlesV2` değil → `getFuturesHistoricCandles`, `getHistoricFundRate` değil → `getFuturesHistoricFundingRates`, `getOpenInterest` değil → `getFuturesOpenInterest`. OI alanı `openInterest` değil → `size`.
- [2026-07-08] STALE (superseded 2026-07-08 monorepo migration): "Backend kök dizinde değil, borsa/backend/ altında" artık YANLIŞ. Backend içeriği kök dizine taşındı (packages/, services/, db-schemas/, core/), frontend/ → web-app/ oldu. Kod ararken backend/ veya frontend/ ile başlayan yol arama.
- [2026-06-27] SignalCard'da `position: absolute` front yüz + sabit `minHeight` kombinasyonu: içerik büyüyünce kartlar bozulur (üst üste biner). Front yüzü `relative` yap, back yüzü `absolute` + `height: 100%` bırak. Bir daha `minHeight` sabiti koyma.
