# Analiz Asistanı — Design Spec

**Tarih:** 2026-06-01  
**Durum:** Onaylı

## Amaç

Bot piyasayı izler, sinyal üretir ve kullanıcıya hazır analiz sunar. Kullanıcı okur, beğenirse işlemi kendisi açar. Emir girişi yok — saf analiz ve rehberlik.

## Layout

```
┌─[TopBar: BTC/ETH canlı fiyat · servis durumu]──────────────┐
│                                                              │
│ ┌──────────────┬─────────────────────────────────────────┐  │
│ │ Sinyal Liste │ Detay Paneli (seçili sinyal)             │  │
│ │              │                                          │  │
│ │ ▲ BTC  0.87  │  ▲ LONG BTCUSDT    Confluence 0.87      │  │
│ │ ▼ ETH  0.71  │                                         │  │
│ │ ▲ BTC  0.68  │  [ECharts Candlestick]                  │  │
│ │ ▼ BTC  0.66  │  entry/stop/hedef yatay çizgiler        │  │
│ │ ...          │  EMA9 / EMA21 overlay                   │  │
│ │              │                                         │  │
│ │              │  🤖 AI Yorum (kısa, 1-2 cümle)          │  │
│ │              │                                         │  │
│ │              │  Giriş   Stop    Hedef   R:R             │  │
│ │              │  78,420  78,180  78,780  1:1.5           │  │
│ └──────────────┴─────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

- Sol panel genişliği: 260px sabit
- Sağ panel: kalan alan
- Responsive değil (masaüstü odaklı)

## Bileşenler

### TopBar
- BTC ve ETH canlı fiyatı (market-data servisten REST polling, 5sn)
- Servis durumu: `market-data` ve `signal-engine` ping (10sn)
- Renk: yeşil=UP, kırmızı=DOWN

### SignalList (sol panel)
- Son 20 sinyal, yeniden eskiye sıralı
- Her satır: yön ikonu (▲/▼) + sembol + confluence skoru + kaç dakika önce
- LONG satırları yeşil sol border, SHORT kırmızı
- Seçili satır highlighted
- Canlı: WebSocket'ten yeni sinyal gelince listenin başına eklenir, 20'yi aşarsa son düşer
- İlk yüklemede REST `GET /signals?limit=20` ile dolu gelir

### DetailPanel (sağ panel)
Seçili sinyal yoksa: "← Soldan bir sinyal seç" placeholder.

Seçili sinyal varsa:

**1. Header**
- Yön + sembol + confluence skoru rozeti

**2. Grafik (ECharts)**
- Candlestick: sembolün son 60 mumu (1m)
- Overlay: EMA9 (mavi), EMA21 (turuncu)
- 3 yatay çizgi: entry (beyaz kesik), stop (kırmızı), hedef (yeşil)
- Volume bar alt grid'de
- Grafik verisi: `GET /candles/:symbol?limit=60&timeframe=1m` (market-data servisten)

**3. AI Yorum kutusu**
- Mavi sol border, italik metin
- Şimdilik mock string (deterministic, indikatör değerlerine göre seçilir)
- Faz 1C'de Ollama'ya bağlanacak

**4. Metrik satırı**
- Giriş / Stop / Hedef / R:R — 4 kutu yan yana

## Backend Değişiklikleri

### signal-engine — yeni endpoint'ler

**REST:** `GET /signals?limit=20`
- Postgres'ten son N sinyali döner
- Alan: id, symbol, direction, entryPrice, stopPrice, targetPrice, rrRatio, confluenceScore, createdAt, indicators_snapshot

**WebSocket:** `ws://localhost:3102/ws`
- Bağlantı sonrası mevcut 20 sinyali push eder (init frame)
- Yeni sinyal üretilince `{type:"signal", data:{...}}` frame gönderir
- Ping/pong her 30sn

### market-data — yeni endpoint

**REST:** `GET /candles/:symbol?limit=60&timeframe=1m`
- Redis cache'ten veya son WS verilerinden son N mumu döner
- Alan: timestamp, open, high, low, close, volume

**REST:** `GET /price/:symbol`
- Anlık fiyat (son kapanış)

## Veri Akışı

```
signal-engine → üretir sinyal → Postgres + Redis signals.new
                                     ↓
                              WS /ws → frontend SignalList güncellenir

market-data → WS'ten BTC/ETH mum verisi alır → Redis'e yazar
                                     ↓
                              GET /candles → frontend DetailPanel grafiği çizer

TopBar → GET /price/BTCUSDT, GET /price/ETHUSDT (5sn polling)
```

## Mock AI Yorum Mantığı (Faz 1C öncesi)

```js
function generateAiComment(signal) {
  const { direction, confluenceScore, indicators_snapshot } = signal;
  const { rsi, macdHistogram, ema9, ema21 } = indicators_snapshot;
  
  if (direction === 'long') {
    if (rsi < 35) return `RSI ${rsi.toFixed(0)}'den döndü — aşırı satım bölgesinden çıkış. EMA konfigürasyonu long destekliyor. Confluence: ${confluenceScore}.`;
    if (ema9 > ema21) return `EMA9 EMA21 üzerinde, momentum pozitif. RSI ${rsi.toFixed(0)} — nötr bölgede. Confluence: ${confluenceScore}.`;
    return `Çoklu indikatör long sinyali verdi. Confluence skoru: ${confluenceScore}.`;
  } else {
    if (rsi > 70) return `RSI ${rsi.toFixed(0)} — aşırı alım bölgesinde. Kısa vadeli düzeltme bekleniyor. Confluence: ${confluenceScore}.`;
    if (ema9 < ema21) return `EMA9 EMA21 altında, momentum negatife döndü. Confluence: ${confluenceScore}.`;
    return `Çoklu indikatör short sinyali verdi. Confluence skoru: ${confluenceScore}.`;
  }
}
```

## Frontend Dosya Yapısı

```
frontend/src/
├── api/
│   ├── signalApi.js        — GET /signals, WS bağlantısı
│   ├── marketApi.js        — GET /candles/:symbol, GET /price/:symbol
│   └── serviceApi.js       — servis health ping
├── components/
│   ├── TopBar.jsx          — canlı fiyat + servis durumu
│   ├── SignalList.jsx       — sol panel, WS'ten güncellenen liste
│   ├── DetailPanel.jsx     — sağ panel container
│   ├── SignalChart.jsx     — ECharts candlestick + overlay + çizgiler
│   ├── AiComment.jsx       — AI yorum kutusu
│   └── MetricRow.jsx       — giriş/stop/hedef/rr 4 kutu
├── store/
│   └── useStore.js         — selectedSignal, signals[], prices{}
├── utils/
│   └── aiComment.js        — mock AI yorum üretici
├── theme.js                — MUI koyu tema + COLORS
├── App.jsx                 — layout grid
└── main.jsx                — ThemeProvider mount
```

## Teknik Kararlar

- **WebSocket:** Native browser WebSocket (harici lib yok)
- **Grafik:** ECharts (echarts-for-react) — mevcut bağımlılık
- **State:** Zustand — signals dizisi + selectedSignal + prices
- **CSS Grid:** App.jsx'te `260px 1fr` — basit, library yok
- **API base URL:** `import.meta.env.VITE_API_URL` (default `http://localhost:3102`)
- **Market data URL:** `import.meta.env.VITE_MARKET_URL` (default `http://localhost:3101`)

## Test Stratejisi

- **api/**: fetch/WS mock ile birim test
- **utils/aiComment.js**: saf fonksiyon, birim test
- **SignalChart**: `buildChartOption()` saf fonksiyon export, birim test
- **MetricRow, AiComment**: render test
- **SignalList, DetailPanel**: store mock ile render test
- Backend endpoint'ler: manuel test (curl + wscat)

## Sıradaki Faz

Faz 1C: `ai-service` (Python/FastAPI/Ollama) — `generateAiComment` yerine gerçek LLM yorumu.

## Kapsam Dışı

- Kullanıcı girişi / auth
- Mobil responsive
- İşlem açma / kapatma
- Bildirimler (Faz 1D)
