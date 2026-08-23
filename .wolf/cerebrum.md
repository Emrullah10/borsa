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

[2026-08-23] Repository SQL'i değiştirdikten sonra SADECE unit testlere güvenme — bu projede
repository testleri `db.query`'yi mock'luyor, yani sorgunun gerçek şemaya karşı çalışıp
çalışmadığını HİÇ doğrulamıyor. `getRecentSignals`'a `real_entry_price` eklendiğinde 236/236
test yeşil geçti ama endpoint canlıda `column o.real_entry_price does not exist` ile 500
dönüyordu — çünkü `2026-08-20-02` migration'ı yazılmış ama local DB'ye hiç uygulanmamıştı.
**Yapılacak:** SQL değiştiren her işten sonra (1) bekleyen migration'ları `psql -f` ile uygula,
(2) servisi gerçekten boot et, (3) endpoint'i `curl` ile çağır. Migration dosyasının repoda
var olması uygulandığı anlamına GELMEZ — `db:migrate:up` script'i idempotent ama otomatik
çalışmıyor, ayrıca schema_migrations tablosu yok, yani neyin uygulandığı takip edilmiyor.

[2026-06-01] Birim testlerde producer fonksiyonun çıktısını ELLE uydurma. setup-builder testleri `{direction:'long', ...}` objesini manuel kurduğu için buildSetup'ın `direction` alanını döndürmediği gözden kaçtı; simulateTrade her zaman short dalına düştü → backtest PF negatif. Tüketici testleri (simulateTrade) gerçek üretici (buildSetup) çıktısıyla beslenmeli ya da producer'ın sözleşmesi ayrıca test edilmeli. Birim testler geçerken entegrasyon kopabilir.

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->

**[2026-08-23] Faz 0 (ölçüm dürüstlüğü) uygulandı; otomatik trade'den önce "giriş kayması" darboğazı seçildi:**
Kullanıcı "projenin benim yerime scalp trade yapmasını istiyorum" dedi ve doğruluk oranını sordu.
Canlı veri çekildi (temiz veri, `CLEAN_DATA_SINCE=2026-08-21T21:25` sonrası, n=99):
win_rate %57.6 iyi görünüyordu **ama `avg_sim_r` sadece +0.0370R** — yani gerçekçi giriş
fiyatıyla işlem başına ~5 sent. `avg_sim_r / avg_r_after_fee = 0.20` → **edge'in ~%80'i giriş
kaymasında buharlaşıyor.** Kullanıcıya 4 seçenek sunuldu, "önce giriş kaymasını çöz" seçildi.
**Üç ölçüm hatası bulundu ve düzeltildi (bkz. buglog bug-150/151/152):** (1) çıkış kayması hiç
modellenmemişti — `exitPrice` her zaman tam stop/target, kayma sadece kaybeden tarafa vurduğu
için hata TEK YÖNLÜ ve edge'i yukarı sapıtıyordu; (2) `setup-builder.js` giriş kapısı
`FEE_ROUNDTRIP=0.0008` hardcoded + yanlışlıkla "maker" etiketli kullanıyordu oysa muhasebe
~0.0018 kullanıyor → kapı muhasebeden ~2× gevşekti; (3) karar metriğinin (avg_sim_r) hiçbir
yerde hata payı yoktu, Wilson sadece win_rate'e uygulanıyordu.
**Sonuç: yeni `avgRInterval` ile n=110'da CI=[-0.161, +0.235] → edge HENÜZ KANITLANMADI.**
Kanıt için ~3160 işlem (~63 gün) gerekiyor. Panel artık bunu sarı uyarıyla dürüstçe söylüyor.
**İYİ HABER:** çıkış kayması 3 senaryoda test edildi (sadece SL / tüm çıkışlar / 3× altcoin
stop-through), üçünde de `avg_sim_r` pozitif kaldı (+0.032/+0.025/+0.023) — geniş %2.5 stop
kararı edge'i kayma varsayımlarına dayanıklı kılmış.
**How to apply:** Bu projede bir metrik iyileştirmesi önerirken önce "bu sayı hangi popülasyonu
ölçüyor ve hata payı ne" diye sor. `win_rate` tanımlayıcıdır, KARAR METRİĞİ `avg_sim_r`'dir
(tek gerçekçi giriş + fee + çıkış kayması içeren sayı). Yeni bir maliyet/gate eklerken
**giriş kapısı ile muhasebenin AYNI sayıyı görmesi** şart — ayrıştıklarında kapı zarar
yazacak setup'ları geçirir.

**[2026-08-23] $6/10x pozisyon boyutu reddedildi — iflas riski %20 (KRİTİK, henüz uygulanmadı):**
Önceki oturumların "10x kaldıraçlı risk hesabı yapılmalı" notu hiç yapılmamıştı; bu oturumda
yapıldı. Stop %2.5 → kayıp teminatın %25'i → **4 ardışık kayıp hesabı sıfırlıyor**, 100 işlemde
görme şansı ~%96. Monte Carlo (20k tur, avg_sim_r=+0.037): **iflas oranı ~%20**, medyan +$44
ama %5'lik senaryo $0. Kaldıraç taraması gösterdi ki **iflas riski sermayeden değil kaldıraçtan
geliyor** — 10x her hesap boyutunda (~$6/$20/$50/$100) ~%20, 3x'te %0.3.
**Karar: 10x yerine 3x öner.** Ayrıca $6/10x kararı mum-kirliliği bulgusundan ÖNCE alınmıştı,
dayandığı win-rate tahminleri artık geçersiz. Faz 3 karar kapısına "pozisyon boyutu iflas
riski <%2" maddesi eklendi; Faz 4 güvenlik sınırlarına "kaldıraç ≤3x" 0. madde olarak yazıldı.
**How to apply:** Bu projede pozisyon boyutu/kaldıraç konuşulurken beklenen değere (medyan kâr)
bakmak YETMEZ — ardışık kayıp serisi + iflas olasılığı hesaplanmalı. Edge ince olduğu için
hayatta kalmak kâr hızından önemli.

**[2026-08-21] Panel "GİRİŞ KAÇTI" krizi — bildirim eklemek yerine önce paneli dürüstleştirmeyi seçtik:**
Kullanıcı 12+ kartın hepsi "GİRİŞ KAÇTI/Süre doldu" derken "nasıl işlem açacağım" diye sordu.
Kök neden: 5m sinyal 10dk geçerli (`entryValidity.js` `WINDOW_CANDLES=2`), panel 90dk gösteriyordu
(`SignalGrid.jsx` eski `FRESH_WINDOW_MS`) — ekranın en az %89'u tanım gereği süresi dolmuş kart,
bu normal durum, arıza değil. İlk yanıtta yanlışlıkla "doğru sinyalleri kaçırıyorsun" imasında
bulunuldu — bu KANITLANMAMIŞTI, kullanıcı haklı olarak itiraz etti. Düzeltme: panelin yanıltıcı
olduğu kanıtlanabilir, sinyal KALİTESİ ayrı ve şu an bilinmeyen bir soru (mum kirliliği fix'i
[2026-08-21] dünkü, DB'deki geçmiş win-rate artık var olmayan bir sistemi ölçüyor).
**Karar: bildirim (Telegram vb.) EKLENMEDİ.** Kanıtlanmamış kaliteli sinyallere daha hızlı
girmeyi sağlamak yanlış şeyi optimize eder. Önce panel AKTİF/GEÇMİŞ sekmelerine bölündü
(`getEntryWindow` yeni fonksiyon, `entryValidity.js`), AKTİF sekmede canlı geri sayım eklendi,
AKTİF boşken "bir şey bozuk değil, günde 4-5 sinyal" mesajı gösteriliyor.
**How to apply:** Kullanıcı "sinyal/panel doğru mu" türünde bir belirsizlik ifade ederse,
önce mevcut veri/kod neyi KANITLIYOR neyi KANITLAMIYOR ayrımını netleştir — hız/bildirim
çözümüne atlamadan önce "temeldeki veri güvenilir mi" sorusunu cevapla. Bu proje zaten
Wilson interval + backtest/canlı parite altyapısına sahip — kaliteyi ölçmek için kullan,
tahmin etme.

**[2026-08-21] Kapanmamış mum kirliliği bug'ı — göstergeler ara tick'lerle bozuluyordu:**
Sunucu backtest:sweep sırasında termal limite çarpıp kapandı; tekrar açılınca CPU/RAM yükü araştırılırken önce YANLIŞ bir hipotez kuruldu ("gösterge hesabı CPU'yu yiyor" — ölçülüp çürütüldü, calcAllIndicators tek çağrı 0.135ms, %1 CPU'nun altında). Ama araştırma sırasında GERÇEK ve daha ciddi bir bug bulundu: Bitget WS `candle1m`/`candle5m` kanalı mum kapanmadan (her tick'te) güncelleme gönderiyor, kodda hiçbir yerde (`bitget-ws.js` handleUpdate, `make-process-candle.js` buffer push) bu ayrım yapılmıyordu — her ara tick koşulsuz buffer'a push ediliyordu. Canlı ölçümle doğrulandı (`redis-cli psubscribe`, aynı ts 4-5 kez tekrar etti). Simülasyonla etkisi ölçüldü: kirli pencerede ADX %62, RSI %15, ATR %12 sapıyor.
**Düzeltilen yanlış bir iddia da var:** İlk aşamada "ADX≥25 hard gate'i tersine çevirip kazanan sinyalleri kaçırtıyor" denmişti — bu YANLIŞTI, kodda öyle bir alt-sınır gate yok (sadece adxMax=65 üst sınır var), DB'de min_adx=14.27 olan gerçek sinyal bulunması bunu kanıtladı. Doğru çerçeve: "veri kalitesi bug'ı," hangi sinyalin nasıl etkilendiği belirsiz.
**Fix:** Yeni saf domain fonksiyonu `core/service-signal-engine/src/domain/candle-buffer.js` → `commitCandle()` — aynı `ts` ile gelen mesajları sadece "forming" state'inde günceller (buffer'a push etmez, sinyal zincirini tetiklemez), `ts` değişince öncekini "kapandı" sayıp buffer'a commit eder. `make-process-candle.js`'e entegre edildi — gösterge/sinyal zinciri artık SADECE `closedCandle != null` olduğunda çalışıyor.
**How to apply:** Böyle bir dedup/close-detection deseni gerektiren başka bir yer bulunursa (örn. market-data'nın candleRepo'su, chart endpoint'i besliyor, AYNI bug'a sahip ama kapsam dışı bırakıldı — trading kararını etkilemiyor) aynı `commitCandle` fonksiyonunu import edip kullan, yeniden yazma.
**Test metodolojisi notu:** Sinyal SAYISINI karşılaştırmak (`saveSignal çağrı sayısı eşit mi`) yanıltıcı — cooldown zaten tekrar sinyalleri bastırıyor, bug'ı maskeliyordu (testler yanlışlıkla yeşil çıktı). Doğru test: sinyalin `indicatorsSnapshot` DEĞERLERİNİ (currentPrice/rsi/adx) noisy vs clean karşılaştırmak — bu, düzeltmeden önce gerçekten kırmızı çıktı (106.55 vs 97.10 gibi tamamen farklı sayılar), düzeltmeden sonra yeşile döndü. Bir bug'ı test ederken çağrı SAYISI değil, çağrının TAŞIDIĞI DEĞER'i doğrula.

**[2026-08-20] Strateji doğrulama Faz 0-3: backtest/canlı parite düzeltmesi, dürüst istatistikler, walk-forward, execution doğrulama altyapısı:**
Kullanıcı gerçek parayla trade etmeden önce "bu bota güvenebilir miyim" sorusuna cevap istedi. Araştırma backtest'in sistematik olarak iyimser olduğunu gösterdi: `simulateTrade` (core/service-backtest) fee/slippage'sız, girişi mum kapanışından alıyordu (canlı sonraki mumun açılışı±slippage), TP/SL beraberliğinde TP kazanıyordu (canlı SL-first), timeout'ta r=0 varsayıyordu. Çözüm: `simulator.js` artık `@borsa-bot/core-tracker`'ın `evaluateOutcome`/`evaluateSimOutcome` saf fonksiyonlarını doğrudan çağırıyor — parite ayrı kod yollarını senkron tutmaya çalışmak yerine KOD DÜZEYİNDE garanti (2026-07-08'deki `calcHigherTfTrend` ortaklaştırmasıyla aynı desen). İstatistik tarafında `getSignalStats` SQL'i CTE'ye çevrildi: `resolved_n` (win rate paydası, `total`dan ayrı), `win_rate_incl_timeout`, `profit_factor_after_fee` eklendi; frontend'e Wilson score interval (`wilsonInterval.js`) eklendi — küçük örneklemde win rate'in gerçek belirsizliğini gösteriyor. `sweep.js`'e walk-forward train/test split (`splitTrainTest`, son 1/3 test) + holdout sembol kontrolü eklendi — eski sweep aynı 5 sembolü hem seçip hem test ediyordu (in-sample fit). Tracker'a backfill (`backfillOutcome`) eklendi — servis restart'ında kaçırılan candle penceresi artık geriye dönük oynatılıyor, sessizce timeout'a düşmüyor. `signal_outcomes`'a additive migration + `POST /outcomes/:id/real-fill` eklendi (Faz 3 altyapısı) ama panel UI formu YAZILMADI — kapsam dışı bırakıldı, sonraki oturumda tamamlanmalı.
**Matematik bulgusu:** $6 teminat/10x kaldıraç/gerçek fee'lerle başabaş WR %48.7 (RR1.2) – %53.6 (RR1.0), iddia edilen %54.7 ile marj çok ince (~1-6 puan) — bu farkı gerçek işlemle kanıtlamak istatistiksel olarak ~550-7900 işlem gerektiriyor, bu yüzden Faz 3'ün amacı "edge kanıtlamak" değil sadece "execution/slippage modelini doğrulamak" olarak sınırlandı.
**How to apply:** Yeni bir backtest/canlı davranış eklenirken (örn. yeni bir gate veya fee kalemi) ARAYA yeni bir hesaplama yazmak yerine önce core-tracker'ın saf fonksiyonlarına eklenip eklenemeyeceğine bak — iki ayrı implementasyon parite riski taşır.

**[2026-07-13] Sinyal kalitesi krizi: WR %37.8 → backtest sweep ile %54.7'ye yükseltildi (bot_config canlıya uygulandı):**
Kullanıcı "tahminler çok kötü, acilen iyileştirmeliyiz, app kullanılacak" dedi. Kırılım analizi iki sistematik kayıp kohortu gösterdi: aşırı-uzama (BB %B>0.8 long'lar %19.6 WR vs ≤0.8 %42.9) ve ADX tükenme (kaybedenler ADX~66-76, kazananlar~55-58). `entry-filters.js` (applyEntryFilters: overextension + adx-exhaustion gate'leri) eklendi — **ama gerçek kazanım filtrelerden gelmedi**, backtest sweep'te 5 ayrı tur ve **4 kritik metodoloji hatası** bulundu ve düzeltildi, sırasıyla:
1. Backtest'in `buildSetup` çağrısı `supportLevel/resistanceLevel/minStopPct` hiç geçirmiyordu (canlı geçiriyordu) — S/R cap hiç uygulanmıyordu, backtest RR hep 1.8 sabit simüle ediyordu ama canlıda RR'ların %76'sı S/R cap'le 1.5'e düşüyordu. Düzeltme WR'ı %37.8→%46'ya çıkardı.
2. Backtest, `meetsMinTarget/meetsMinRR/meetsFeeFloor` gate'lerini **hiç kontrol etmiyordu** — canlıda reddedilecek her setup simüle ediliyordu.
3. Sweep sembol seçimi (BTC/ETH/SOL/BNB/XRP) canlı sistemin fiilen ürettiği sinyal evrenini (küçük-cap altcoinler: EVAAUSDT, LABUSDT vb. — BTC 3 günde SIFIR sinyal üretmişti) hiç temsil etmiyordu; büyük-cap ATR%'si (~0.04%) altcoinlerinkinden (~1.0%+) 25× farklıydı, bu yüzden `meetsMinTarget` (ATR-tabanlı hedef mesafesi ≥%1 gerektiriyor) tüm adaylar reddediyordu.
4. Canlı DB'de S/R-kapaklı sinyaller (RR~1.5) %45.7 WR, kapaksız "açık sahada" sinyaller (RR~1.8) sadece %33 WR — bu, filtrelerden çok daha güçlü bir sinyaldi. `buildSetup`'a `requireSrCap` gate'i eklendi (S/R'a yakın hedef yoksa sinyal reddedilir).
Son sweep (gerçek semboller + tüm düzeltmeler): setup-builder'ın sabit `ATR_STOP_MULT=1.5`/`TARGET_RR=1.8` değerleri de parametrize edilip 48-kombinasyonluk grid tarandı. Kazanan: `threshold=0.70, atrStopMult=1.5, targetRR=1.2, requireSrCap=true` → **%54.7 WR, PF 1.33, avgR +0.149**, ayda ~130 sinyal (günde 4-5, "az ama kaliteli" — kullanıcı onayı). `db-schemas/migrations/2026-07-13-01-signal-quality-params.sql` ile canlı `bot_config`'e uygulandı, boot.js/container.js üzerinden `makeProcessCandle`'a bağlandı, canlıda RR~1.1-1.2 sinyaller üretilerek doğrulandı.
**Ders**: backtest/canlı parite, "aynı fonksiyonu çağırmak" kadar "aynı gate'leri kontrol etmek" ve "aynı sembol evrenini kullanmak" da gerektiriyor — bunlardan biri eksik olursa sweep sonuçları anlamlı ama yanlış yöne işaret edebilir.

**[2026-07-08] 5 iyileştirme: paper-trading, backtest rejimi, kırılımlı istatistik, süre metrikleri, tie-break:**
Canlı istatistikler (27 sinyal, %50 WR) örneklem olarak "işlem açsam kazanır mıyım" sorusuna cevap veremeyecek kadar küçüktü. Beş iyileştirme fazlı uygulandı (hepsi additive migration + testler yeşil + servisler boot ediyor doğrulamasıyla):
1. **Paper-trading**: `signal_outcomes.sim_entry_price/sim_pnl_r` — sim giriş = sinyalden sonraki ilk 1m mumun open'ı ± sabit slippage (config'ten, ticker-spread tahmini değil — kullanıcı onayı). Gerçek dolum fiyatının sinyal-anı kapanış fiyatından farklı olduğunu modelliyor.
2. **Backtest'e rejim/higherTfTrend**: canlı `calcConfluence`'a rejim+higherTfTrend geçiriyordu, backtest geçmiyordu — en büyük canlı/backtest sapması buydu. `calcHigherTfTrend` ortak pure fonksiyona çıkarılıp ikisi de aynı fonksiyonu kullanacak şekilde birleştirildi (parite garantisi). `core/service-backtest/src/domain/aligned-buffer.js` (rolling-pointer, lookahead yok) düşük-frekanslı seriyi (4h/5m) 1m döngüsüne hizalıyor.
3. **Rejim kaydı + kırılım**: `signals.regime/higher_tf_trend` kaydediliyor artık; `getStatsBreakdown({by, days})` whitelist-map ile (regime/tf/direction/hour) — ham `by` asla SQL'e girmiyor.
4. **Süre/timeout metrikleri**: `avg_min_to_tp/sl`, `timeout_rate`, `avg_sim_r` — `resolved_at - created_at`'tan. Fee sabiti (0.0008 hardcoded) `bot_config.taker_fee`'den `makeSignalRepository({db, takerFee})` parametresine taşındı — artık hem sim hem stats tek kaynaktan besleniyor.
5. **Tie-break loglama**: `evaluateOutcome` aynı mumda hem TP hem SL tetiklenirse `tieBreak:true` döndürüyor (önceden sessizce SL kabul ediliyordu), `signal_outcomes.tie_break` + notes'a yazılıyor.
Migration: additive-only (`ALTER TABLE ADD COLUMN IF NOT EXISTS`), `db-schemas/migrations/` + `db:migrate:up` script'i eklendi (basit idempotent dosya koşucu, schema_migrations tablosu yok).

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
