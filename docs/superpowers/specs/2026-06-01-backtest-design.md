# Faz 1B — service-backtest Tasarım Spec'i

**Tarih:** 2026-06-01  
**Durum:** Onaylandı

---

## Özet

Bitget REST API'den 30 günlük geçmiş mum verisi çekerek signal-engine mantığını (indicators → liquidation-pressure → confluence → setup-builder) geçmiş veriye uygulayan ve performans raporu üreten bağımsız bir backtest servisi.

---

## Kapsam

- Semboller: `BTCUSDT`, `ETHUSDT`
- Timeframe: `1m` (signal-engine ile aynı)
- Süre: 30 gün
- Çıktı: terminal özet tablosu + JSON dosyası
- Çalıştırma: `npm run backtest` (tek seferlik script, sürekli çalışmaz)

---

## Mimari

```
services/service-backtest/
├── package.json
├── main.js                  ← giriş noktası, orchestration
└── src/
    ├── fetcher.js           ← Bitget REST veri çekimi
    ├── simulator.js         ← sinyal simülasyonu (TP/SL/TIMEOUT)
    └── reporter.js          ← terminal tablo + JSON çıktı

backend/backtest-results/    ← JSON raporlar buraya kaydedilir
```

---

## Veri Akışı

```
Bitget REST API
  → fetcher.fetchCandles(symbol, '1m', 30)     [sayfalama ile ~43200 mum]
  → fetcher.fetchFundingHistory(symbol)         [8s'de bir kayıt]
  → fetcher.fetchOIHistory(symbol)              [snapshot'lar]
  → (LSR: sabit 0.5 — REST geçmiş veri sağlamıyor)
  ↓
Her mum için rolling window (son 60 mum):
  → calcAllIndicators(candles)
  → calcLiquidationPressure({ funding, oi, lsr: 0.5 })
  → calcConfluence(indicators, liquidationPressure)   [eşik: 0.65]
  → buildSetup(candles, confluence)
  ↓
Sinyal üretildiyse:
  → simulator.simulateTrade(setup, remainingCandles)  [maks 240 mum = 4 saat]
  → WIN | LOSS | TIMEOUT
  ↓
reporter.generateReport(results)
  → Terminal: sembol bazlı tablo
  → JSON: backend/backtest-results/YYYY-MM-DD-HH-mm.json
```

---

## Bileşenler

### `fetcher.js`

**`fetchCandles(symbol, timeframe, days)`**
- Bitget REST `/api/v2/mix/market/candles` endpoint'i
- `bitget-api` npm paketi (mevcut bağımlılık)
- Sayfalama: 200 mum/istek, `endTime` kaydırarak 30 gün tamamlanır
- Döner: `[{ timestamp, open, high, low, close, volume }]` kronolojik sırada

**`fetchFundingHistory(symbol)`**
- Bitget REST `/api/v2/mix/market/history-fund-rate`
- 8 saatlik funding rate kayıtları
- Her mum için en yakın funding değeri interpolasyonla bulunur

**`fetchOIHistory(symbol)`**
- Bitget REST `/api/v2/mix/market/open-interest`
- Mevcut OI snapshot'ı (geçmiş OI serisi yok → sabit kullanılır)
- Not: Bitget REST geçmiş OI serisi sağlamıyor, anlık değer tüm mumlar için kullanılır

**LSR:** Sabit `0.5` (nötr) — Bitget REST geçmiş LSR verisi sağlamıyor.

### `simulator.js`

**`simulateTrade(setup, candles)`**
- `setup`: `{ entry, stop, target, direction }`
- `candles`: setup sonrası gelen mumlar (maks 240 adet = 4 saat)
- Her mumun `high`/`low`'una bakarak TP veya SL'e ulaşılıp ulaşılmadığını kontrol eder
- Döner: `{ outcome: 'WIN'|'LOSS'|'TIMEOUT', r: number, durationMinutes: number }`
- R hesabı: `(exit - entry) / (entry - stop)` (LONG için)

### `reporter.js`

**Terminal çıktı (sembol bazlı):**
```
Symbol    Signals  Win%   PF    MaxDD  AvgR
BTCUSDT   142      54.2%  1.83  4      0.91
ETHUSDT   98       51.0%  1.61  5      0.78
TOTAL     240      52.9%  1.74  6      0.86
```

**JSON çıktı (`backend/backtest-results/YYYY-MM-DD-HH-mm.json`):**
```json
{
  "generatedAt": "ISO timestamp",
  "period": { "from": "...", "to": "...", "days": 30 },
  "symbols": ["BTCUSDT", "ETHUSDT"],
  "summary": { "totalSignals": 240, "winRate": 0.529, "profitFactor": 1.74, "maxDrawdown": 6, "avgR": 0.86 },
  "bySymbol": {
    "BTCUSDT": { "signals": 142, "winRate": 0.542, "profitFactor": 1.83, "maxDrawdown": 4, "avgR": 0.91, "trades": [...] }
  }
}
```

---

## Metrikler

| Metrik | Hesaplama |
|--------|-----------|
| Win Rate | WIN sayısı / toplam sinyal (TIMEOUT hariç) |
| Profit Factor | toplam kazanç R toplamı / toplam kayıp R toplamı |
| Max Drawdown | arka arkaya maksimum kayıp zinciri (sinyal sayısı olarak) |
| Avg R | tüm trade'lerin ortalama R değeri |

TIMEOUT sinyaller raporlanır ama win/loss metriklerine dahil edilmez.

---

## Hata Yönetimi

- Rate limit: istek aralarında 200ms bekleme
- API hatası: 3 retry, sonra hata logu + devam
- Yetersiz veri (< 60 mum): sembol atlanır, uyarı basılır

---

## Test Stratejisi

- `fetcher.js`: mock Bitget client ile birim testi
- `simulator.js`: sentetik mum dizileri ile birim testi (WIN/LOSS/TIMEOUT senaryoları)
- `reporter.js`: bilinen girdi ile çıktı formatı testi
- Entegrasyon: gerçek API ile `--dry-run` flag'i (sadece veri çeker, simüle etmez)

---

## package.json Değişiklikleri

`backend/package.json`'a eklenecek script:
```json
"backtest": "node services/service-backtest/main.js"
```

`services/service-backtest/package.json` workspaces'e dahil edilir (otomatik, mevcut glob kapsar).
