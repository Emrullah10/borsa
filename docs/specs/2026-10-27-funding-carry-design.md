# Funding Taşıma (Delta-Nötr Funding Carry) — Tasarım ve Yol Haritası

Tarih: 2026-10-27 (güncelleme 2026-10-28) · Durum: Faz 1 (kâğıt üstü) sunucuda çalışıyor; giriş eşiği %10'a indirildi, Faz 1 süresi 7 güne kısaldı (§3a, §9).

---

## 1. Neden sıfırdan: elimizdeki kanıt

5 ayda denenen her **yön tahmini** (fiyat yükselecek mi düşecek mi) yaklaşımı ölçüldü ve hepsi başarısız oldu:

| Ne denendi | Sonuç | Kanıt |
|---|---|---|
| Canlı scalp botu (confluence: EMA/RSI/MACD/BB/VWAP) | **Kaybediyor** | 30 gün, 402 işlem, işlem başı −0,137R, güven aralığı tamamen eksi |
| Aynı motorun 12 ayar kombinasyonu (5m/15m/1h × maker/taker × büyük/orta coin) | 12/12 başarısız | 180 gün, görülmemiş dönemde hepsi çöktü |
| Lab: 4 yeni fikir (funding uçları, momentum, dönüş, dağınıklık) | 0/4 | Holdout'ta hiçbiri geçmedi |
| İleri test (2026-10-01'den beri taze veri): funding uçları | **KALDI** | 113 işlem, ortalama −0,078R (rapor git geçmişinde: backtest-results/forward-2026-10-27.md, eski kod 2026-10-28 silindi) |
| İleri test: F1 momentum | Bekliyor | 26/90 gün, karar için erken |

Sonuç: sorun ayar değil, **soru yanlış**. Kripto'da kısa vadeli yönü komisyon sonrası kârlı tahmin etmek perakende bir bot için kanıtlanmış şekilde mümkün olmadı. LLM'ler de bunu çözmüyor (Alpha Arena S1: gerçek parayla 6 öncü modelin 4'ü %31-63 kaybetti).

## 2. "Kesine yakın kazanç" gerçeği

Kesine yakın kazanç **yön tahmininden gelmez**. Gelebileceği tek yer, piyasanın yapısından doğan ve fiyat yönünden bağımsız ödemelerdir. Kripto futures'ta bunun en büyüğü **funding**:

- Perpetual futures'ın vadesi yok. Fiyatı spot'a yakın tutmak için her 8 saatte (bazı coinlerde 4s/1s) long'cular ile short'çular arasında ödeme yapılır.
- Piyasa çoğunlukla iyimser olduğu için funding çoğunlukla **pozitif**: long'cular short'çulara öder.
- **Strateji:** aynı coinden spot **AL** + aynı adet futures **SHORT**. Fiyat %50 düşerse spot'ta kaybettiğini short'ta kazanırsın, %100 çıkarsa tersi. Net fiyat etkisi ≈ 0. Geriye funding ödemeleri kalır.

**Somut örnek** (Telegram'da göreceğin mesajın biçimi; rakamlar örnek):

```
🟢 [KÂĞIT] TAŞIMA AÇ — JCTUSDT
Spot: 4511 JCT AL @ 0.0399
Futures: 4511 JCT SHORT @ 0.0399 (1x, aynı adet)
Tutar: $180.00 · son 14 gün funding: yıllık %18.2
Fiyat yönü önemsiz: biri kazanırken diğeri kaybeder. Kazanç = funding ödemeleri.
```

Bu, Ethena gibi milyar dolarlık ürünlerin de iş modeli. "Kesine yakın" ifadesinin dürüst anlamı: **çoğu ay küçük artı, kötü ayda çok küçük eksi**. Zengin eden değil, kaybettirmeyen ve yavaş kazandıran bir makine.

## 3. Kurallar (dondurulmuş — `core/service-carry/src/domain/carry-config.js`)

| Kural | Değer | Neden |
|---|---|---|
| Evren | Bitget'te kripto (hisse/altın RWA değil) + **aynı coinin USDT spot çifti var** + spot hacim ≥ $1M/gün + perp hacim ≥ $5M/gün | Spotu olmayan coinde strateji uygulanamaz (funding verisi olan 161 coinin 44'ünün Bitget spotu yok) |
| Sinyal | Son **14 tam günün** ortalama funding'i, yıllığa çevrilmiş | Kısa pencere (3 gün) gürültüye işlem açtırıyor: maliyet ×2'de eksiye düşüyor |
| Aç | Yıllık **≥ %10** (2026-10-28'e kadar %15) | Üç ayrı dönemde %15'ten iyi ya da eşit (§3a); %10'da gidiş-dönüş maliyeti (%0,32-0,64) ~12-24 günde çıkar |
| Kapat | Yıllık **< %5**, ya da sıralamada ilk 10'dan düştü, ya da borsa duyurusu (delist) | Giriş/çıkış arası boşluk (histerezis) gereksiz al-sat'ı önler |
| Boyut | En fazla **5 coin**, her biri özsermayenin %18'i (%10 tampon) | Tek coin riskini sınırlar |
| Karar zamanı | Günde bir, 00:00 UTC ödemesinden sonra, 08:00'den önce | Backtest'in kazanç penceresiyle birebir aynı |

Kurallardan biri değişirse bu **yeni hipotez** demektir ve ileri test sayacı sıfırlanır.

### 3a. 2026-10-28 değişikliği: giriş eşiği %15 → %10

Sebep: %15'te bugün hiçbir coin geçmiyordu (en yüksek %14,3), kâğıt test veri üretmeden bekleyecekti. Eşikler
**üç ayrı dönemde** karşılaştırıldı (bugünün 23 coinlik evreni, aynı saf fonksiyonlar, çıkış %5):

| Giriş | Binance 2022-23 | Binance 2024→ | Bitget kendi (07-17→10-28) | Bitget, maliyet ×2 | Bitget ort. açık coin |
|---|---|---|---|---|---|
| %8 | %1,9 | %13,5 | %10,9 | %6,6 | 5,0 |
| **%10** | **%2,0** | **%13,6** | **%13,0** | **%10,3** | 4,6 |
| %12 | %2,2 | %13,6 | %13,5 | %11,2 | 4,4 |
| %15 (eski) | %1,9 | %13,6 | %9,3 | %7,0 | 3,7 |
| %20 | %0,8 | %13,1 | %8,9 | %7,0 | 3,4 |

%10 hiçbir dönemde %15'ten kötü değil; Bitget'in kendi verisinde ve maliyet stresinde belirgin iyi (daha çok slot dolu → boşta
bekleyen para az). %8'in altı maliyet ×2'de zayıflıyor. %12 de aynı kalitede ama bugün yalnız 1 coin geçiyor; %10'da 5 coin.
Uyarı: bu seçim tüm veriye bakılarak yapıldı (temiz holdout yok); gerekçe tek dönemde değil üç dönemde birden ≥ olması.

**Gerçek spread kontrolü (2026-10-28 anlık):** tek yön yarım spread (spot+perp) medyanı %0,034; 23 coinin 21'inde modelden
(%0,06 likit / %0,16 ince) ucuz. Modelden pahalı 2 coin: EVAA %0,22, IRYS %0,21 (ince, $1,6-2,5M spot hacim).

## 4. Kanıt (backtest — `npm run carry:backtest`)

Backtest canlı servisle **aynı fonksiyonları** çağırıyor (selectCarryBook, trailingApr, carryDayOf, maliyet). Maliyet: Bitget VIP0 spot %0,1 + futures taker %0,06 + bacak başına %0,03-0,08 kayma, açılışta ve kapanışta.

**Binance funding'i ile (2022'den bu yana veri; Bitget sadece 90 gün saklıyor):**

| Yıl | Yıllık getiri | En kötü düşüş | Pozitif ay | Maliyet ×2 |
|---|---|---|---|---|
| 2022 (ayı piyasası) | %0,0 (hiç işlem yok, nakitte bekledi) | 0 | — | %0,0 |
| 2023 | %3,2 | −%0,17 | 8/12 | %2,1 |
| 2024 | %7,7 | −%0,29 | 8/12 | %5,1 |
| 2025 | %6,3 | −%0,09 | 8/12 | %5,6 |
| 2026 (Eki'ye kadar) | %19,2 | −%1,19 | 10/10 | %18,3 |

- 2024-01 → bugün: 34 ayın 27'si pozitif, en kötü ay −%0,06.
- Walk-forward: 2022-23'te seçilen ayarlar 2024-26'da %12,5; denenen **48 ayar kombinasyonunun 48'i de** görülmemiş dönemde pozitif (medyan %9). Sonuç ayara duyarlı değil — gerçek bir yapısal etki işareti.
- İstatistiksel güç: günlük getirinin oynaklığı çok düşük olduğu için ~**30 günlük** ileri test anlamlı sonuç verir (scalp botu için ~400 işlem gerekiyordu).

**⚠️ En önemli dürüst bulgu — Bitget'in KENDİ funding'i:**

| Dönem 2026-07-17 → 10-27 | Yıllık |
|---|---|
| Bitget'in kendi funding'i (gerçekte bize ödenecek) | **%8,4** |
| Aynı dönem, Binance funding'i | %26,2 |

Yüksek funding ödeyen coinlerin çoğunun Bitget'te likit spot piyasası yok. **Bitget-tek-borsa beklentimiz: normal piyasada yılda ~%5-10, sıcak piyasada %15-20+, ayı piyasasında ~%0 (nakitte bekler).** 27 Ekim'de %15 eşiğini geçen coin yoktu; %10 eşiğiyle 28 Ekim'de 5 coin geçiyor (EVAA, JCT, HUMA, APR, NIL).

**Backtest'in modellemediği şeyler** (kâğıt ileri test bunları ölçecek): bugünün likiditesiyle seçilmiş evren (hayatta kalma yanlılığı), spot-perp fiyat farkının (baz) değişimi, delist zorunlu kapanışları, gerçek spread.

## 5. Riskler ve korumalar

| Risk | Ne olur | Koruma |
|---|---|---|
| **Borsa riski** (FTX gibi) | Her şey gider | Korunamaz. Kaybetmeyi göze alamayacağın parayı koyma; kârı düzenli çek |
| **Delist** | Perp zorla kapanır, spot tek başına kalır | Risk bekçisi: Bitget duyurularını 10 dk'da bir tarar, evrendeki her coin izlenir; "delist" → pozisyon hemen kapanır, coin 30 gün bloklu |
| **Short tarafın likidasyonu** | Coin 2 katına çıkarsa ayrı hesaptaki 1x short likide olabilir | Bitget **UTA + Delta Neutral Mode** (Mayıs 2026): spot varlık futures teminatı sayılır; kaldıraç 1x |
| **Funding'in eksiye dönmesi** | Short ödeme yapar | 14 günlük ortalama %5'in altına inince çık; eksi günler backtest'te dahil |
| **Bayat/eksik veri** | Yanlış karar | 00:00 ödemesi DB'ye gelmeden karar yok; ticker 5 dk'dan eskiyse işlem yok |
| **Servis kapalı** | O günün kararı atlanır | 3 üst üste hata → Telegram uyarısı |

## 6. Bilgi kaynakları — nereden ne alıyoruz

| Bilgi | Kaynak | Not |
|---|---|---|
| Kontrat listesi, RWA bayrağı | `GET /api/v2/mix/market/contracts` | RWA'lar (hisse/altın) dışarıda |
| Futures fiyat/hacim/mark | `GET /api/v2/mix/market/tickers` | |
| Spot fiyat/hacim, açık çiftler | `GET /api/v2/spot/market/tickers`, `/api/v2/spot/public/symbols` | |
| Anlık funding + aralık | `GET /api/v2/mix/market/current-fund-rate` | 8s/4s/1s karışık |
| Gerçekleşen funding geçmişi | `GET /api/v2/mix/market/history-fund-rate` | Sadece ~90 gün → günlük kaydediyoruz (`funding_rates`) |
| Uzun geçmiş (araştırma) | Binance `fapi/v1/fundingRate` | 2022'den beri; Bitget vekili |
| Borsa duyuruları | `GET /api/v2/public/annoucements` | En fazla 10 kayıt (ölçüldü); genel + 3 kategori birleştiriliyor |
| Ücretler | Bitget destek sayfası (VIP0) | Spot %0,1 (BGB ile %0,08), futures %0,02/%0,06 |

Hepsi anahtarsız public uçlar; Faz 1 için Bitget API anahtarı gerekmez.

## 7. AI'ın rolü (OpenRouter) — varsayılan KAPALI

**Karar (2026-10-27):** `AI_PROVIDER=none` varsayılan. Kâr kararı (hangi coin, ne zaman aç/kapat) tamamen funding matematiği; AI bunu iyileştiremez. Duyuru tarafında delist/takas/askı kalıplarını kural katmanı zaten yakalıyor; AI yalnız kuralların kaçırdığı alışılmadık ifadede seviye yükseltirdi ve Türkçe özet yazardı → kâra ölçülebilir katkısı yok, kullanıcı "sadece anlatacaksa para ödemem" dedi. Kod duruyor; açmak için `AI_PROVIDER=openrouter` + anahtar ya da ücretsiz `AI_PROVIDER=ollama`.

**Açılırsa ne yapar:** Bitget duyurusu evrendeki bir coini anıyorsa ikinci görüş verir ("bu duyuru elimdeki pozisyon için ne anlama geliyor?") ve tek cümlelik sade Türkçe özet yazar.

**Ne yapmaz:** Fiyat/yön tahmini yapmaz, işlem açtırmaz, sayı üretmez. Kural katmanı "delist" dediyse AI bunu düşüremez, yalnız yükseltebilir. AI erişilemezse kural katmanı tek başına çalışır (denendi).

**Yapılandırma** (`core/service-carry/src/infrastructure/llm-client.js`):

```json
{
  "model": "openrouter/auto",
  "plugins": [{ "id": "auto-router", "cost_tier": "low",
    "allowed_models": ["deepseek/deepseek-v4-flash*", "anthropic/claude-haiku-5.5",
                       "google/gemini-3.1-flash-lite*", "openai/gpt-5-nano", "..."] }],
  "provider": { "require_parameters": true, "data_collection": "deny",
                "max_price": { "prompt": 1, "completion": 4 } },
  "response_format": { "type": "json_schema", "...": "..." }
}
```

- Auto Router istemi sınıflandırıp görev tipine göre modeli seçer; router ücreti yok, seçilen modelin fiyatı ödenir. Havuz ucuz + JSON-şema destekli modellerle sınırlı, `max_price` tavan.
- Tahmini maliyet: çağrı başı ~$0,0002, günde birkaç çağrı → **ayda birkaç sent**.
- Yerel Ollama'ya geçiş: `AI_PROVIDER=ollama` (aynı istemci, OpenAI-uyumlu `/v1`).

## 8. Mimari

```
core/service-carry/src/
  domain/          carry-config · funding-buckets · selector · paper-book · eligibility
                   announcement-rules · backtest-carry · carry-format      (saf, test edilir)
  infrastructure/  bitget-public · binance-funding · telegram-sender · llm-client · ai-sentinel
                   repositories/carry-repository · repositories/funding-store-repository
  application/     carry-engine  (funding tahsilatı, günlük karar, risk bekçisi, özet)
services/service-carry/   boot (HTTP :3104 + 5 dk'lık zamanlayıcı) · scan.js (kuru çalıştırma)
                          backtest.js · backfill-funding.js
db-schemas/04-funding-rates.sql · db-schemas/migrations/2026-10-27-01-carry.sql
web-app/src/pages/CarryPage.jsx           panelin tek sayfası
```

Komutlar: `npm run dev:carry` (servis) · `npm run carry:scan` (şu an karar verilse ne olurdu) · `npm run carry:backtest [-- --cost 2]` · `npm run carry:backfill-funding` (backtest verisi).

Eski scalp sinyal botu (market-data, signal-engine, tracker, notifier, backtest/lab, service-ai, eski panel sayfaları) 2026-10-28'de silindi; git geçmişinde duruyor.

## 9. Yol haritası ve karar kapıları

**Faz 1 — Kâğıt üstü çalıştırma (7 gün, ~2026-11-04; para riski yok)**
Servis sunucuda 7/24 çalışır, gerçek fiyatlarla sanal $1000 yönetir, Telegram'a her açılış/kapanış ve günlük rapor gelir.
Amaç kârlılığı kanıtlamak DEĞİL (7 günlük getiri istatistiksel olarak anlamsız; kârlılık kanıtı funding geçmişi + Faz 2'nin
gerçek dolumları), kodun gerçek hayatta doğru çalıştığını görmek. 30 gün → 7 gün kısaltıldı (2026-10-28): taşımada geçmiş
funding = gerçekleşmiş ödeme kaydı, yön stratejilerindeki gibi simüle edilmiş sinyal değil; açık risk maliyet ve işleyiş.
Kapı (hepsi): her gün karar alındı · pozisyonlar açıldı · funding defteri Bitget'in gerçek ödemeleriyle tutarlı ·
Telegram mesajları ve panel doğru · beklenmeyen hata yok.

**Faz 2 — Küçük gerçek para, elle uygulama ($100-300)**
Bitget'te UTA + Delta Neutral Mode aç. Bot Telegram'dan ne yapacağını söyler, sen 2 emri (spot al + short) elle girersin. Gerçek dolumlar kaydedilir. En kötü gerçekçi kayıp: komisyonlar + baz kayması (birkaç dolar). Kapı (Faz 3'e geçiş): 30 gün, gerçek net > 0, gerçek dolum maliyeti modelden kötü değil.

**Faz 3 — Otomatik emir**
Bitget API anahtarı (**yalnız işlem izni, çekim izni YOK, IP kısıtlı**). İki bacak aynı anda, kill-switch, günlük kayıp limiti, aynı coinde tek pozisyon. Kod Faz 2 kapısı geçmeden yazılmaz.

**Faz 4 — Getiriyi artırma (isteğe bağlı)**
- Çoklu borsa funding karşılaştırma (Binance/OKX/Bybit public API): aynı coin başka borsada 3 kat ödüyor olabilir (yukarıdaki %8 vs %26).
- Boşta bekleyen USDT'yi Bitget Earn'de değerlendirme.

## 10. Senin yapman gerekenler

1. Sunucuya alma (komutlar ayrıca verildi). OpenRouter anahtarı **gerekmez** (AI varsayılan kapalı, bkz. §7).
2. 30 gün boyunca Telegram'daki günlük raporu takip etmek. Kuralları bu sürede **değiştirmemek**.
