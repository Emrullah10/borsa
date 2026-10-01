# İleri Test (kâğıt üstü) — Dondurulmuş Kurallar

Tarih: 2026-09-30 · Durum: kurallar DONDURULDU (kod: `core/service-backtest/src/domain/lab/lab-forward.js`, test bunu sabitler)

## Neden
Strateji laboratuvarı 4 fikri de eledi (bkz. `2026-09-30-strateji-laboratuvari-design.md`). F1 momentum'un 2026 holdout'u
yandı (aday başına tek bakış). Aynı geçmişe tekrar bakmak veri avcılığıdır; **taze veri** gerçek sınavdır.
Para riski yoktur: adaylar yalnızca kâğıt üstünde, aynı ölçüm koduyla izlenir.

## Adaylar (lab'da seçilen ayarlarla dondurulmuş — sonuca bakıp değiştirilemez)
| Aday | Ayar |
|---|---|
| F1 momentum (Tip 2) | L=28 gün, haftalık dengeleme, 5 long + 5 short |
| Funding uçları (Tip 1) | z=2.5, tutma 72 saat, stop 3×ATR, minAbsRate 0.0002 |

Not: Tip 1 doğrulamada "piyango" olarak elenmişti (kâr tek işlemdi); taze veride yeniden ölçülüyor çünkü ileri veri holdout'u yakmaz.

## Sınav
- **Başlangıç:** 2026-10-01 00:00 UTC (ilk işlem günü). Bundan önceki hiçbir gün sayılmaz.
- **Karar için minimum:** Tip 2 ≥ 90 işlem günü · Tip 1 ≥ 100 işlem. Daha azsa durum **"yetersiz veri"**: akan ortalama gösterilir ama **erken karar verilmez**.
- **Geçme şartı** (lab holdout'uyla aynı kurallar, 2 aile için Bonferroni → %97.5 güven):
  1. Güven aralığı alt sınırı > 0 (Tip 1'de haftalık küme bootstrap, Tip 2'de 5 günlük blok)
  2. Maliyetler ×2 iken ortalama > 0
  3. En iyi %2.5 gözlem çıkarılınca ortalama > 0
  4. 200 rastgele denemenin ≥ %95'ini geç
  5. (Tip 1) n ≥ 100
- Geçse bile **canlıya alma ayrı bir karardır** (küçük para, sıkı kayıp limiti); bu yalnız istatistiksel geçiştir.

## Çalıştırma
`npm run backtest:forward` — mumları/funding'i günceller, raporu `backtest-results/forward-<tarih>.{json,md}` yazar.
Haftada bir yeterli (Bitget funding'i ~90 gün saklar; en geç ~60 günde bir çalıştır, yoksa Bitget tarafı kalıcı kaybolur — Binance vekili
kalır ama korelasyon ~0.58). Sunucuda DEĞİL, local'de.

## Yeni fikir eklemek
Yeni bir aday bu listeye ancak **yeni bir dondurma tarihiyle** eklenebilir (kendi başlangıcı ve minimum süresiyle); mevcut adayların
kuralları değiştirilmez. Aday sayısı arttıkça Bonferroni düzeltmesi sıkılaşır.
