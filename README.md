# Funding Taşıma (Bitget)

Yön tahmini yapmayan, funding ödemesi toplayan bot. Her pozisyon: aynı coinden **spot AL** + aynı adet
**futures SHORT**. Fiyat ne yöne giderse gitsin iki bacak birbirini götürür; kazanç, futures'ta long
tarafının short tarafına ödediği funding'den gelir.

Şu an **kâğıt üstü** çalışır (gerçek emir yok). Strateji, kanıt, riskler ve faz kapıları:
[docs/specs/2026-10-27-funding-carry-design.md](docs/specs/2026-10-27-funding-carry-design.md)

## Kurallar (dondurulmuş)

- Son 14 günün funding'i yıllık **%10 üstü** → aç, **%5 altı** → kapat, en fazla **5 coin**.
- Yalnız Bitget'te USDT spot çifti olan, spot hacmi ≥ $1M ve futures hacmi ≥ $5M olan coinler.
- Bitget delist / token takası / askı duyurusu → pozisyon kapanır ya da yeni açılmaz.

## Yapı

```
core/service-carry/       saf kurallar, Bitget/Binance istemcileri, motor (testli)
services/service-carry/   HTTP :3104 + zamanlayıcı, tarama, backtest, veri çekme
web-app/                  panel (tek sayfa); /carry istekleri vite proxy ile :3104'e gider
db-schemas/               funding_rates + carry_* tabloları
```

## Komutlar

```
npm install && (cd web-app && npm install)
npm run db:migrate                 # tabloları oluşturur
npm run dev:carry                  # servis (port 3104)
npm run carry:scan                 # şu an karar verilse ne olurdu (hiçbir şey yazmaz)
npm run carry:backfill-funding     # backtest için funding geçmişi (Bitget + Binance)
npm run carry:backtest [-- --cost 2]
npm test                           # arka uç testleri
cd web-app && npm run dev          # panel (5180)
```

Gerekli ortam değişkenleri: [.env.example](.env.example)
