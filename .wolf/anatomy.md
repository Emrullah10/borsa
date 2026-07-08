# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-07-08T14:19:00.804Z
> Files: 186 tracked | Anatomy hits: 0 | Misses: 0

## ../../../.claude/plans/

- `imdi-benim-ayn-ekilde-eager-ember.md` — Plan: Borsa Projesini Tropiq Monorepo Mimarisine Taşıma (~1710 tok)
- `kazanma-oranlar-m-z-ok-d-k-polished-fountain.md` — Plan: Scalp Bot Kârlılık Düzeltmesi (Win Rate / PF) (~2616 tok)
- `ok-fazla-sinyal-var-splendid-meadow.md` — Plan: Taze Sinyal Penceresini Kısalt (120 dk → 15 dk) (~437 tok)
- `projemize-bu-t-m-ara-t-rmanla-mighty-wolf.md` — Plan: Geç Kalmış Giriş Koruması ("Giriş Kaçtı") (~1596 tok)
- `yani-durabilir-kenarda-birde-silly-hanrahan.md` — Plan: Sinyal Kartları UI + Sol Drawer Navigasyon (~1427 tok)

## ../../../.claude/projects/-Users-emrullah-developer-fullStack-borsa/memory/

- `scalp-bot-project.md` — Scalp Bot — Proje Durumu (~3543 tok)

## ./

- `.gitignore` — Git ignore rules (~55 tok)
- `CLAUDE.md` — OpenWolf (~57 tok)
- `docker-compose.yml` — Docker Compose services (~169 tok)
- `launch.sh` — Scalp Bot — tüm backend servislerini başlatır (~1066 tok)
- `package.json` — Node.js package manifest (~301 tok)

## .claude/

- `settings.json` (~441 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## .codegraph/

- `.gitignore` — Git ignore rules (~47 tok)
- `codegraph.db-shm` (~8738 tok)

## .superpowers/brainstorm/60771-1780346526/content/

- `layout-options.html` (~2945 tok)
- `signal-detail.html` (~2247 tok)
- `waiting.html` (~39 tok)

## .superpowers/brainstorm/9679-1780554755/content/

- `card-mockup.html` (~1371 tok)
- `waiting.html` (~40 tok)

## .vscode/

- `launch.json` (~1055 tok)
- `settings.json` (~141 tok)
- `tasks.json` (~657 tok)

## backend/

- `.gitignore` — Git ignore rules (~7 tok)
- `package-lock.json` — npm lock file (~29384 tok)
- `package.json` — Node.js package manifest (~297 tok)

## backend/db-schemas/

- `00-init.sql` (~129 tok)
- `01-config-watchlist.sql` — SQL: tables: watchlist, bot_config (~216 tok)
- `02-signals.sql` — SQL: tables: signals, signal_outcomes (~398 tok)

## backend/packages/modules/config/

- `index.js` — 12factor-style config loader. (~239 tok)
- `package.json` — Node.js package manifest (~28 tok)

## backend/packages/modules/datasource/

- `index.js` — Exports createDatasources (~175 tok)
- `package.json` — Node.js package manifest (~50 tok)

## backend/packages/modules/datasource/connectors/

- `postgre.js` — Exports createPostgresPool (~96 tok)
- `redis.js` — Exports createRedisConnection (~162 tok)

## backend/packages/modules/helper/

- `index.js` — timestamp: exitOnError, appStarted (~202 tok)
- `package.json` — Node.js package manifest (~28 tok)

## backend/packages/modules/service-discovery/

- `index.js` — API routes: GET (1 endpoints) (~285 tok)
- `package.json` — Node.js package manifest (~32 tok)

## backend/services/service-ai/

- `main.py` — API: 2 endpoints (~260 tok)
- `ollama_client.py` — generate (~171 tok)
- `prompt.py` — Signal → Claude prompt builder: _rsi_comment, _ema_comment, _macd_comment, build_prompt (~280 tok)
- `requirements.txt` — Python dependencies (~21 tok)
- `test_analyze.py` — test_analyze_returns_comment_when_ollama_ok, test_analyze_returns_null_when_ollama_fails, test_healt (~572 tok)
- `test_prompt.py` — TDD tests for build_prompt: 7 tests (symbol, direction, prices, RSI, EMA, missing snapshot, short) (~350 tok)
- `test_prompt.py` — test_prompt_contains_symbol, test_prompt_contains_direction, test_prompt_contains_prices, test_promp (~415 tok)

## backend/services/service-backtest/

- `main.js` — SYMBOLS: runBacktest, main (~945 tok)
- `package.json` — Node.js package manifest (~84 tok)

## backend/services/service-backtest/src/

- `fetcher.js` — Exports fetchCandles, fetchFundingHistory, fetchOISnapshot, interpolateFunding (~908 tok)
- `reporter.js` — Exports calcMetrics, formatTable, generateReport (~996 tok)
- `simulator.js` — Exports simulateTrade (~335 tok)

## backend/services/service-backtest/test/

- `fetcher.test.js` — Declares candles (~567 tok)
- `reporter.test.js` — Declares sampleTrades (~471 tok)
- `simulator.test.js` — Declares candle (~540 tok)

## backend/services/service-market-data/

- `main.js` — API routes: GET (3 endpoints) (~543 tok)
- `package.json` — Node.js package manifest (~114 tok)

## backend/services/service-market-data/configs/

- `app-config.js` (~128 tok)

## backend/services/service-market-data/src/

- `bitget-ws.js` — Exports startBitgetWS (~2638 tok)
- `candle-store.js` — Exports pushCandle, getCandles, getLastPrice (~213 tok)
- `publisher.js` — Exports createPublisher (~340 tok)

## backend/services/service-market-data/test/unit/

- `candle-store.test.js` — Declares candle (~575 tok)
- `publisher.test.js` — Declares candle (~507 tok)

## backend/services/service-notifier/

- `main.js` — Declares initialize (~615 tok)

## backend/services/service-notifier/configs/

- `app-config.js` (~179 tok)

## backend/services/service-notifier/src/

- `formatter.js` — Exports formatEmailSubject, formatEmailHtml (~817 tok)
- `formatter.test.js` — Declares longSignal (~454 tok)
- `mailer.js` — Exports initMailer, sendSignalEmail (~222 tok)

## backend/services/service-signal-engine/

- `main.js` — API routes: GET (4 endpoints) (~784 tok)
- `package.json` — Node.js package manifest (~117 tok)

## backend/services/service-signal-engine/configs/

- `app-config.js` (~128 tok)

## backend/services/service-signal-engine/src/

- `confluence.js` — Exports adaptiveThreshold, calcConfluence (~1522 tok)
- `indicators.js` — Exports calcEMA, calcRSI, calcBollingerBands, calcATR + 6 more (~1587 tok)
- `liquidation-pressure.js` — Exports calcLiquidationPressure (~572 tok)
- `regime.js` — BTC trendine göre piyasa rejimini hesaplar (~395 tok)
- `setup-builder.js` — Exports applySRCap, buildSetup (~880 tok)
- `signal-repository.js` — Exports saveSignal, createOutcome, getPendingOutcomes, resolveOutcome + 3 more (~1571 tok)
- `subscriber.js` — Exports getCurrentRegime, startSubscriber (~2523 tok)
- `ws-server.js` — Exports createWsServer (~219 tok)

## backend/services/service-signal-engine/test/unit/

- `confluence.test.js` — ADX >= 25 ile güçlü trend fixture'ları (~1728 tok)
- `indicators.test.js` — Declares closes20 (~1724 tok)
- `liquidation-pressure.test.js` — Declares result (~762 tok)
- `regime.test.js` — Declares makeCandles (~381 tok)
- `setup-builder.test.js` — --- applySRCap testleri (değişmedi) --- (~1624 tok)
- `signal-repository.test.js` — Declares fakeRows (~281 tok)
- `ws-server.test.js` — Declares sent (~317 tok)

## backend/services/service-tracker/

- `main.js` — initialize: refreshPending (~1037 tok)
- `package.json` — Node.js package manifest (~97 tok)

## backend/services/service-tracker/configs/

- `app-config.js` (~204 tok)

## backend/services/service-tracker/src/

- `tracker.js` — Açık bir outcome için mum OHLC'ye göre sonuç değerlendir. (~439 tok)
- `tracker.test.js` — Helper: candle oluştur (~738 tok)

## core/service-market-data/

- `package.json` — Node.js package manifest (~45 tok)

## core/service-market-data/src/application/use-cases/

- `make-publisher.js` — Exports makePublisher (~301 tok)

## core/service-market-data/src/infrastructure/persistence/repositories/

- `candle-repository.js` — Exports makeCandleRepository (~213 tok)

## core/service-market-data/test/unit/

- `candle-repository.test.js` — Declares candle (~540 tok)
- `make-publisher.test.js` — Declares candle (~500 tok)

## core/service-notifier/

- `package.json` — Node.js package manifest (~44 tok)

## core/service-notifier/src/infrastructure/

- `mailer.js` — Exports makeMailer (~129 tok)

## core/service-notifier/test/unit/

- `formatter.test.js` — Declares longSignal (~458 tok)
- `mailer.test.js` (~348 tok)

## core/service-signal-engine/

- `package.json` — Node.js package manifest (~63 tok)

## core/service-signal-engine/src/application/use-cases/

- `make-process-candle.js` — Exports makeProcessCandle (~2209 tok)

## core/service-signal-engine/src/infrastructure/persistence/repositories/

- `signal-repository.js` — Exports makeSignalRepository (~1591 tok)

## core/service-signal-engine/test/unit/

- `signal-repository.test.js` — Declares fakeRows (~261 tok)

## core/service-tracker/

- `package.json` — Node.js package manifest (~44 tok)

## core/service-tracker/src/application/use-cases/

- `make-process-outcome-candle.js` — Exports makeProcessOutcomeCandle (~648 tok)

## core/service-tracker/test/unit/

- `evaluate-outcome.test.js` — Helper: candle oluştur (~745 tok)
- `make-process-outcome-candle.test.js` — Declares TIMEOUT_MS (~668 tok)

## docs/

- `gateaway-ARCHITECTURE.md` — account-web-gateway — Sıfırdan Anlama Rehberi: Bir API Gateway'in Anatomisi (~6048 tok)
- `MONOREPO_STRUCTURE_EN.md` — 📂 tropiq‑mono‑repo – Full Folder & File Explanation (English) (~3265 tok)
- `MONOREPO_STRUCTURE.md` — 📂 tropiq‑mono‑repo – Tam Klasör & Dosya Açıklaması (~3404 tok)
- `WEB-APPARCHITECTURE.md` — account-web-app — Sıfırdan Anlama Rehberi: Bir React SPA'nın Anatomisi (~7065 tok)

## docs/superpowers/plans/

- `2026-05-31-scalp-bot-phase1a.md` — Scalp Bot — Faz 1A: Altyapı + Market Data + Signal Engine (~14691 tok)
- `2026-06-01-analiz-asistani.md` — Analiz Asistanı Implementation Plan (~12943 tok)
- `2026-06-01-service-backtest.md` — service-backtest Implementation Plan (~6934 tok)
- `2026-06-01-web-panel.md` — Web Panel (Faz 1E) Implementation Plan (~6549 tok)
- `2026-06-02-ai-service.md` — AI Service (Faz 1C) Implementation Plan (~5821 tok)
- `2026-06-04-email-notifier.md` — Email Notifier Implementation Plan (~2832 tok)
- `2026-06-04-telegram-notifier.md` — Telegram Notifier Implementation Plan (~2900 tok)

## docs/superpowers/specs/

- `2026-06-01-analiz-asistani-design.md` — Analiz Asistanı — Design Spec (~1684 tok)
- `2026-06-01-backtest-design.md` — Faz 1B — service-backtest Tasarım Spec'i (~1190 tok)
- `2026-06-02-ai-service-design.md` — AI Service (Faz 1C) — Design Spec (~1119 tok)

## frontend/

- `index.html` — Scalp Bot Panel (~81 tok)
- `package.json` — Node.js package manifest (~218 tok)
- `vite.config.js` (~76 tok)

## frontend/src/

- `App.jsx` — App (~197 tok)
- `App.test.jsx` (~327 tok)
- `main.jsx` (~112 tok)
- `test-setup.js` (~11 tok)
- `theme.js` — Exports COLORS, theme (~122 tok)
- `theme.test.js` (~122 tok)

## frontend/src/api/

- `aiApi.js` — Exports analyzeSignal (~122 tok)
- `aiApi.test.js` — Declares SAMPLE_SIGNAL (~412 tok)
- `marketApi.js` — Exports fetchCandles, fetchPrice (~173 tok)
- `marketApi.test.js` — Declares fakeCandles (~325 tok)
- `regimeApi.js` — Exports fetchRegime (~84 tok)
- `regimeApi.test.js` — Declares result (~232 tok)
- `serviceApi.js` — Exports checkServices (~147 tok)
- `signalApi.js` — Exports fetchSignals, connectSignalWS (~195 tok)
- `signalApi.test.js` — Declares fakeSignals (~251 tok)
- `statsApi.js` — Exports fetchStats (~74 tok)

## frontend/src/components/

- `AiComment.jsx` — AiComment (~149 tok)
- `AiComment.test.jsx` (~104 tok)
- `AppDrawer.jsx` — AppDrawer — renders modal (~1035 tok)
- `AppDrawer.test.jsx` — mockStore (~836 tok)
- `MetricRow.jsx` — Metric (~255 tok)
- `MetricRow.test.jsx` (~163 tok)
- `SignalCard.jsx` — FLIP_DURATION (~4610 tok)
- `SignalCard.jsx` — 3D flip kart bileşeni: ön yüz (sembol/yön/fiyatlar), arka yüz (AI yorum + gösterge rozetleri), isNew animasyonu (~350 tok)
- `SignalCard.test.jsx` — MOCK_SIGNAL (~935 tok)
- `SignalChart.jsx` — buildSignalChartOption (~731 tok)
- `SignalChart.test.jsx` — candles (~280 tok)
- `SignalFilters.jsx` — SORT_OPTIONS (~926 tok)
- `SignalGrid.jsx` — FRESH_WINDOW_MS (~1507 tok)
- `SignalGrid.test.jsx` — mkSignal (~1248 tok)
- `StatsPage.jsx` — StatBox (~2132 tok)
- `TopBar.jsx` — SYMBOLS (~856 tok)
- `TopBar.test.jsx` — user (~611 tok)

## frontend/src/data/

- `mockData.js` — Exports mockSignals, mockCandles, mockServiceStatus (~509 tok)
- `mockData.test.js` — Declares s (~324 tok)

## frontend/src/store/

- `useStore.js` — Exports useStore (~320 tok)
- `useStore.test.js` — Declares reset (~488 tok)

## frontend/src/utils/

- `aiComment.js` — Exports generateAiComment (~360 tok)
- `aiComment.test.js` — Declares comment (~313 tok)
- `entryValidity.js` — Bir sinyalin giriş penceresinin hâlâ geçerli olup olmadığını hesaplar. (~369 tok)
- `entryValidity.test.js` — Declares base (~782 tok)

## services/service-market-data/

- `main.js` (~33 tok)
- `package.json` — Node.js package manifest (~125 tok)

## services/service-market-data/src/

- `bitget-ws.js` — Exports startBitgetWS (~2616 tok)
- `boot.js` — Exports boot (~352 tok)
- `container.js` — Exports buildContainer (~149 tok)
- `routes.js` — API routes: GET (3 endpoints) (~240 tok)

## services/service-notifier/

- `main.js` (~33 tok)
- `package.json` — Node.js package manifest (~116 tok)

## services/service-notifier/src/

- `boot.js` — Exports boot (~625 tok)
- `container.js` — Exports buildContainer (~128 tok)

## services/service-signal-engine/

- `main.js` (~33 tok)
- `package.json` — Node.js package manifest (~124 tok)

## services/service-signal-engine/src/

- `boot.js` — Exports boot (~526 tok)
- `container.js` — Exports buildContainer (~203 tok)
- `routes.js` — API routes: GET (4 endpoints) (~409 tok)
- `subscriber.js` — Exports startSubscriber (~344 tok)
- `ws-server.test.js` — Declares sent (~315 tok)

## services/service-tracker/

- `main.js` (~33 tok)
- `package.json` — Node.js package manifest (~120 tok)

## services/service-tracker/src/

- `boot.js` — Exports boot (~445 tok)
- `container.js` — Exports buildContainer (~204 tok)
