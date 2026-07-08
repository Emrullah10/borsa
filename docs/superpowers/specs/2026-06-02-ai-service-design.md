# AI Service (Faz 1C) — Design Spec

**Tarih:** 2026-06-02  
**Durum:** Onaylı

## Amaç

Mock AI yorum (`generateAiComment`) yerine gerçek Ollama LLM yorumu. Kullanıcı sinyale tıklayınca DetailPanel FastAPI'ye istek atar, Ollama `qwen2.5` tüm indikatörleri halk dilinde açıklar: güçlü yönler, riskler, giriş/stop/hedef değerlendirmesi.

## Mimari

```
Frontend (DetailPanel)
  → POST http://localhost:3110/analyze
  → service-ai (FastAPI, port 3110)
  → POST http://localhost:11434/api/generate (Ollama)
  ← yorum metni
  ← AiComment bileşeni güncellenir
```

Backend (signal-engine) değişmez. Frontend direkt FastAPI'ye çağırır.

## Dizin Yapısı

```
backend/services/service-ai/
├── main.py              — FastAPI app, /analyze endpoint, CORS
├── prompt.py            — prompt builder (saf fonksiyon, test edilebilir)
├── ollama_client.py     — Ollama HTTP çağrısı
├── requirements.txt     — fastapi, uvicorn, httpx, pytest
├── test_prompt.py       — prompt builder unit testleri
└── test_analyze.py      — /analyze endpoint integration testi (Ollama mock)
```

## API

### POST /analyze

**Request:**
```json
{
  "symbol": "BTCUSDT",
  "direction": "long",
  "entryPrice": 78420,
  "stopPrice": 78180,
  "targetPrice": 78780,
  "rrRatio": 1.5,
  "confluenceScore": 0.87,
  "indicatorsSnapshot": {
    "rsi": 28.4,
    "ema9": 78450,
    "ema21": 78380,
    "macdHistogram": 0.12,
    "atr": 240
  }
}
```

**Response:**
```json
{
  "comment": "RSI 28'e düşmüş, bu fiyatın çok satıldığı anlamına geliyor..."
}
```

**Hata:**
```json
{ "error": "Ollama yanıt vermedi", "comment": null }
```

HTTP 200 her zaman döner (hata durumunda comment null, frontend fallback gösterir).

## Prompt Şablonu

```
Sen bir kripto futures trading asistanısın. Teknik analizi sade Türkçeyle, halk diline uygun şekilde açıklarsın. Jargon kullanma, her terimi kısaca açıkla.

--- SİNYAL BİLGİSİ ---
Yön: {LONG/SHORT} | Sembol: {symbol}
Giriş: {entryPrice} | Stop: {stopPrice} | Hedef: {targetPrice} | Risk/Ödül: 1:{rrRatio}
Confluence Skoru: {confluenceScore} (0-1 arası, yüksek = daha güçlü sinyal)

--- İNDİKATÖRLER ---
RSI: {rsi} {rsi_yorum}
EMA9: {ema9} / EMA21: {ema21} → {ema_yorum}
MACD Histogram: {macdHistogram} → {macd_yorum}
ATR (volatilite): {atr}

--- GÖREV ---
Aşağıdaki 3 soruyu yanıtla, toplam 5-7 cümle, somut ve pratik ol:
1. Bu sinyalin güçlü yönleri neler? (hangi göstergeler destekliyor)
2. Dikkat edilmesi gereken riskler? (hangi göstergeler zayıf veya karışık sinyal veriyor)
3. Giriş {entryPrice} mantıklı mı? Stop {stopPrice}'da dur, hedef {targetPrice}'a ulaşmak gerçekçi mi?

Türkçe yaz. "AL" veya "SAT" deme — sadece analiz yap, karar kullanıcıya ait.
```

**RSI yorumları:**
- rsi < 30: "(aşırı satım — fiyat çok düştü, toparlanma beklenebilir)"
- rsi > 70: "(aşırı alım — fiyat çok yükseldi, düzeltme gelebilir)"
- 30 ≤ rsi ≤ 70: "(nötr bölge)"

**EMA yorumu:**
- ema9 > ema21: "kısa vadeli trend yukarı"
- ema9 < ema21: "kısa vadeli trend aşağı"
- yakın: "trend belirsiz"

**MACD yorumu:**
- histogram > 0: "momentum pozitif"
- histogram < 0: "momentum negatif"
- yakın 0: "momentum nötr"

## Ollama Ayarları

- Model: `qwen2.5:latest`
- URL: `http://localhost:11434/api/generate`
- `stream: false`
- Timeout: 30 saniye
- Hata durumunda: `comment: null` dön (frontend mock yorumu gösterir)

## Frontend Değişiklikleri

### DetailPanel.jsx
- Sinyal seçilince `POST http://localhost:3110/analyze` çağır
- Yükleme sırasında: "🤖 Analiz yapılıyor..." spinner
- Hata/null durumunda: mock `generateAiComment` fallback
- Başarılı: LLM yorumunu `AiComment`'e geçir

### Yeni: frontend/src/api/aiApi.js
```js
export async function analyzeSignal(signal) {
  // POST /analyze → { comment }
  // hata → null
}
```

### CORS
FastAPI'de `localhost:5180`'e izin verilir.

## Test Stratejisi

**Python:**
- `test_prompt.py`: `build_prompt(signal)` saf fonksiyon — çıktı string'in beklenen alanları içerdiğini doğrula
- `test_analyze.py`: `/analyze` endpoint'i `httpx.AsyncClient` ile test et, Ollama `httpx` mock ile

**Frontend:**
- `aiApi.test.js`: fetch mock ile `analyzeSignal` testi
- `DetailPanel.test.jsx`: "Analiz yapılıyor..." ve sonuç gösterimi testi

## Çalıştırma

```bash
# Ollama zaten çalışıyor olmalı
cd backend/services/service-ai
pip install -r requirements.txt
uvicorn main:app --port 3110 --reload
```

## Kapsam Dışı

- Auth / API key
- Yorum cache (her tıkta yeni istek)
- Model seçimi (şimdilik sabit qwen2.5)
- Streaming response (şimdilik tek seferde)
