# Strateji Laboratuvarı — Tasarım (Alt-proje 1)

Tarih: 2026-09-30 · Durum: kullanıcı onayladı (sohbette), yazılı spec incelemesi bekliyor

## Bağlam

Canlı bot 30 günde istatistiksel olarak kaybediyor (n=402, avg_sim_r −0.137R,
%95 CI [−0.238, −0.036]). 180 günlük walk-forward sweep iki kez koşuldu
(2026-09-02, 2026-09-03): confluence ailesinin 12 kombinasyonunun 12'si holdout'ta
başarısız. Parametre ayarı çözüm değil — **strateji ailesi değişmeli**.

Üç alt-proje:
1. **Strateji laboratuvarı** (bu spec) — yeni fikirleri aynı katı sınavdan geçir
2. AI'ı OpenRouter'a taşı (araştırmacı + web aramalı olay filtresi) — 1 bitince
3. Kazananı canlıya al (önce kâğıt üstü) — sadece kazanan çıkarsa

## Kapsam (kullanıcı kararı: ikisi de test edilir)

**Tip 1 — Funding uçları (tek coin, günde 0-3 sinyal, elle girilebilir).**
Funding z-score aşırı yüksekse SHORT, aşırı düşükse LONG; sabit tutma süresi + stop.

**Tip 2 — Günlük sepet (5 long + 5 short, günlük yeniden dengeleme).**
Evren: 24s hacmi ≥ $5M olan perp'ler (bugün ~89). Üç aday kural:
- F1 momentum: 1-4 haftalık getiriye göre üst beşli long / alt beşli short
- F2 dönüş: önceki günün getirisine göre tersi
- F3 (arXiv 2604.26747 benzeri): küçük, düşük hacimli, geniş gün-içi aralıklı, pozitif trend → long

## Sınav kuralları (sonradan DEĞİŞTİRİLEMEZ)

- **Bölünme:** 2024-04 → 2025-06 ayar · 2025-07 → 2025-12 doğrulama ·
  **2026-01 → 2026-09 nihai sınav** (sadece seçilen aday, TEK kez açılır)
- **Geçme şartı (nihai sınav):** fee + kayma + funding sonrası ort. R'nin %95 CI alt sınırı > 0;
  maliyetler 2× iken de > 0; Tip 1 için n ≥ 100.
- **Sahte-pozitif kontrolü:** aynı sınav rastgele yön sinyalleriyle koşulur; bunun kaybetmesi gerekir.
  Kazanıyorsa sınav bozuktur, sonuçlar geçersiz.
- Çoklu deneme: denenen aday sayısı raporlanır; en iyiyi seçmek için düzeltme uygulanır (aday sayısı kadar karşılaştırma).

## Veri

| Veri | Kaynak | Derinlik |
|---|---|---|
| 1H mum | Bitget REST (mevcut `candles` tablosu, tf=1h) | 2023-12'den |
| 1D mum | Bitget REST (`tf=1d`) | 2024-04'ten (~900 gün) |
| Funding | Bitget (yalnız ~90 gün) + **Binance geçmişi** (yıllar) | Binance ile 2022'den |

Notlar:
- Bitget↔Binance funding korelasyonu SOL için 0.58 (aynı anlar) — tam ikame değil.
  Funding sinyali Binance'ten üretilir, **maliyet/PnL Bitget** tarafında modellenir; korelasyon raporlanır.
- Mevcut `fetchFundingHistory` yalnızca son ~33 günü çekiyor (`pageSize=100`, sayfalama yok) → **bug**, düzeltilir ve DB'ye yazılır.
- Bugünden itibaren funding günlük kaydedilir (kaydedilmeyen veri kalıcı kaybolur).
- Hayatta-kalma yanlılığı: delist edilmiş coinler evrende yok → raporda açıkça belirtilir, mümkünse
  o günkü hacim filtresi kullanılır (bugünün değil).

## Mimari (mevcut backtest altyapısının üstüne)

Ayrı Python projesi AÇILMAZ (bu projede en çok hata backtest↔canlı hesap farkından çıktı).

- `core/service-backtest/src/domain/` altında yeni saf modüller:
  `funding-extreme-signal.js`, `basket-factors.js` (F1-F3), `basket-portfolio.js`
  (sıralama → pozisyonlar → günlük PnL), `cost-model.js` (fee+kayma+funding, mevcut sabitlerle),
  `random-baseline.js`, `multiple-testing.js`.
- `services/service-backtest/src/lab.js`: veriyi DB'den okur, sınavı koşar, JSON + Türkçe rapor yazar.
- Mevcut yeniden kullanılanlar: `fetcher.js`, `cached-fetcher.js`, `candle-store-repository.js`,
  `walk-forward.js` (sabit aralık), `reporter.js`, `avgRInterval` mantığı.
- Yeni tablo: `funding_rates(symbol, source, ts, rate)`; migration `db-schemas/`.
- Sunucuda DEĞİL, local'de çalışır (REST fırtınası → 88°C geçmişi).

## Hata durumları

Veri boşluğu olan gün/coin atlanır ve sayılır (rapor "kaç gün/coin atlandı" der);
API hatasında yeniden deneme mevcut fetcher gibi; sessiz sıfır YOK.

## Test

Saf fonksiyonlar TDD ile: sıralama/seçim, PnL muhasebesi (fee, funding işareti long/short), bölünme
sınırlarında sızıntı yokluğu (t günü sinyali t+1 açılışıyla), rastgele taban çizgisi determinizmi.
Üretici çıktısıyla tüketici testi (cerebrum 2026-06-01 dersi).

## Çıktı

`backtest-results/lab-<tarih>.json` + sade Türkçe rapor: her fikir için geçti/kaldı ve nedeni.
Hiçbiri geçmeyebilir — bu da geçerli, değerli sonuçtur.

## Kapsam dışı

Canlı emir gönderme, canlı bota dokunma (yalnız Telegram'a "deneysel" uyarısı — kullanıcı onayı bekler),
OpenRouter geçişi (Alt-proje 2), kanıtlanmamış stratejiyi canlıya alma (Alt-proje 3).
