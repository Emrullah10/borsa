# AI Service (Faz 1C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mock AI yorumunu kaldır, sinyale tıklayınca Python FastAPI + Ollama `qwen2.5`'ten gerçek halk-dili analiz getir.

**Architecture:** `service-ai` (Python/FastAPI, port 3110) tek endpoint sunar: `POST /analyze`. Frontend'deki DetailPanel sinyal seçilince bu endpoint'i çağırır, yükleme sırasında spinner gösterir, yorum gelince `AiComment` bileşenine geçirir. Hata durumunda mock fallback devreye girer. Backend (signal-engine) değişmez.

**Tech Stack:** Python 3.11, FastAPI, uvicorn, httpx (Ollama HTTP client), pytest + pytest-asyncio (test). Frontend: fetch API, React useState.

**Ortam notları:**
- Repo git DEĞİL — commit YAPMA
- Ollama zaten çalışıyor: `http://localhost:11434`, model `qwen2.5:latest` kurulu
- service-ai dizini: `backend/services/service-ai/`
- Frontend dizini: `frontend/`
- Her task sonunda `.wolf/memory.md` son tablosuna satır ekle

---

## File Structure

```
backend/services/service-ai/
├── main.py              — FastAPI app, CORS, /health + /analyze endpoint
├── prompt.py            — build_prompt(signal: dict) → str  (saf fonksiyon)
├── ollama_client.py     — async generate(prompt: str) → str | None
├── requirements.txt     — bağımlılıklar
├── test_prompt.py       — prompt builder unit testleri (pytest)
└── test_analyze.py      — /analyze endpoint testi (httpx.AsyncClient, Ollama mock)

frontend/src/api/
└── aiApi.js             — analyzeSignal(signal) → string | null

frontend/src/components/
└── DetailPanel.jsx      — güncellenir: LLM yorum state + loading + fallback
```

---

## Task 1: Python servis iskeleti + requirements

**Files:**
- Create: `backend/services/service-ai/requirements.txt`
- Create: `backend/services/service-ai/main.py`

- [ ] **Step 1: requirements.txt oluştur**

`backend/services/service-ai/requirements.txt`:
```
fastapi==0.111.0
uvicorn==0.30.1
httpx==0.27.0
pytest==8.2.2
pytest-asyncio==0.23.7
```

- [ ] **Step 2: main.py iskeleti oluştur**

`backend/services/service-ai/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="Scalp Bot AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5180"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class Signal(BaseModel):
    symbol: str
    direction: str
    entryPrice: float
    stopPrice: float
    targetPrice: float
    rrRatio: float
    confluenceScore: float
    indicatorsSnapshot: Optional[dict] = None


@app.get("/health")
def health():
    return {"status": "ok", "service": "service-ai"}


@app.post("/analyze")
async def analyze(signal: Signal):
    return {"comment": None}
```

- [ ] **Step 3: Bağımlılıkları kur**

```bash
cd /Users/emrullah/developer/fullStack/borsa/backend/services/service-ai
pip install -r requirements.txt
```

Expected: kurulum başarılı.

- [ ] **Step 4: Servisin ayağa kalktığını doğrula**

```bash
cd /Users/emrullah/developer/fullStack/borsa/backend/services/service-ai
uvicorn main:app --port 3110 &
sleep 2 && curl -s http://localhost:3110/health
```

Expected: `{"status":"ok","service":"service-ai"}`

```bash
kill %1
```

---

## Task 2: prompt.py — build_prompt saf fonksiyonu

**Files:**
- Create: `backend/services/service-ai/prompt.py`
- Test: `backend/services/service-ai/test_prompt.py`

- [ ] **Step 1: Failing test yaz**

`backend/services/service-ai/test_prompt.py`:
```python
import pytest
from prompt import build_prompt


SAMPLE_SIGNAL = {
    "symbol": "BTCUSDT",
    "direction": "long",
    "entryPrice": 78420.0,
    "stopPrice": 78180.0,
    "targetPrice": 78780.0,
    "rrRatio": 1.5,
    "confluenceScore": 0.87,
    "indicatorsSnapshot": {
        "rsi": 28.4,
        "ema9": 78450.0,
        "ema21": 78380.0,
        "macdHistogram": 0.12,
        "atr": 240.0,
    },
}


def test_prompt_contains_symbol():
    prompt = build_prompt(SAMPLE_SIGNAL)
    assert "BTCUSDT" in prompt


def test_prompt_contains_direction():
    prompt = build_prompt(SAMPLE_SIGNAL)
    assert "LONG" in prompt.upper()


def test_prompt_contains_prices():
    prompt = build_prompt(SAMPLE_SIGNAL)
    assert "78420" in prompt
    assert "78180" in prompt
    assert "78780" in prompt


def test_prompt_contains_rsi():
    prompt = build_prompt(SAMPLE_SIGNAL)
    assert "28" in prompt


def test_prompt_contains_ema_yorum():
    prompt = build_prompt(SAMPLE_SIGNAL)
    # ema9 > ema21 → "yukarı" olmalı
    assert "yukarı" in prompt.lower()


def test_prompt_handles_missing_snapshot():
    signal = {**SAMPLE_SIGNAL, "indicatorsSnapshot": None}
    prompt = build_prompt(signal)
    assert "BTCUSDT" in prompt
    assert isinstance(prompt, str)
    assert len(prompt) > 50


def test_prompt_short_direction():
    signal = {**SAMPLE_SIGNAL, "direction": "short"}
    prompt = build_prompt(signal)
    assert "SHORT" in prompt.upper()
```

- [ ] **Step 2: Test'in fail ettiğini doğrula**

```bash
cd /Users/emrullah/developer/fullStack/borsa/backend/services/service-ai
pytest test_prompt.py -v 2>&1 | tail -15
```

Expected: FAIL — `ModuleNotFoundError: No module named 'prompt'`

- [ ] **Step 3: prompt.py yaz**

`backend/services/service-ai/prompt.py`:
```python
def _rsi_comment(rsi: float) -> str:
    if rsi < 30:
        return f"{rsi:.0f} (aşırı satım — fiyat çok düştü, toparlanma beklenebilir)"
    if rsi > 70:
        return f"{rsi:.0f} (aşırı alım — fiyat çok yükseldi, düzeltme gelebilir)"
    return f"{rsi:.0f} (nötr bölge)"


def _ema_comment(ema9: float, ema21: float) -> str:
    diff_pct = abs(ema9 - ema21) / ema21 * 100
    if diff_pct < 0.05:
        return f"EMA9 {ema9:.0f} / EMA21 {ema21:.0f} → trend belirsiz, ikisi birbirine çok yakın"
    if ema9 > ema21:
        return f"EMA9 {ema9:.0f} / EMA21 {ema21:.0f} → kısa vadeli trend yukarı (EMA9 üstte)"
    return f"EMA9 {ema9:.0f} / EMA21 {ema21:.0f} → kısa vadeli trend aşağı (EMA9 altta)"


def _macd_comment(histogram: float) -> str:
    if histogram > 0.05:
        return f"{histogram:.3f} → momentum pozitif, alıcılar baskın"
    if histogram < -0.05:
        return f"{histogram:.3f} → momentum negatif, satıcılar baskın"
    return f"{histogram:.3f} → momentum nötr, yön belirsiz"


def build_prompt(signal: dict) -> str:
    symbol = signal["symbol"]
    direction = signal["direction"].upper()
    entry = signal["entryPrice"]
    stop = signal["stopPrice"]
    target = signal["targetPrice"]
    rr = signal["rrRatio"]
    score = signal["confluenceScore"]
    snap = signal.get("indicatorsSnapshot") or {}

    rsi = snap.get("rsi")
    ema9 = snap.get("ema9")
    ema21 = snap.get("ema21")
    macd = snap.get("macdHistogram")
    atr = snap.get("atr")

    indicator_lines = []
    if rsi is not None:
        indicator_lines.append(f"- RSI: {_rsi_comment(rsi)}")
    if ema9 is not None and ema21 is not None:
        indicator_lines.append(f"- EMA: {_ema_comment(ema9, ema21)}")
    if macd is not None:
        indicator_lines.append(f"- MACD Histogram: {_macd_comment(macd)}")
    if atr is not None:
        indicator_lines.append(f"- ATR (volatilite): {atr:.0f}")

    indicators_section = (
        "\n".join(indicator_lines)
        if indicator_lines
        else "- İndikatör verisi mevcut değil"
    )

    return f"""Sen bir kripto futures trading asistanısın. Teknik analizi sade Türkçeyle, halk diline uygun şekilde açıklarsın. Jargon kullanma, her terimi kısaca açıkla.

--- SİNYAL BİLGİSİ ---
Yön: {direction} | Sembol: {symbol}
Giriş: {entry} | Stop: {stop} | Hedef: {target} | Risk/Ödül: 1:{rr}
Confluence Skoru: {score:.2f} (0-1 arası, yüksek = daha güçlü sinyal)

--- İNDİKATÖRLER ---
{indicators_section}

--- GÖREV ---
Aşağıdaki 3 soruyu yanıtla, toplam 5-7 cümle, somut ve pratik ol:
1. Bu sinyalin güçlü yönleri neler? (hangi göstergeler destekliyor)
2. Dikkat edilmesi gereken riskler? (hangi göstergeler zayıf veya karışık sinyal veriyor)
3. Giriş {entry} mantıklı mı? Stop {stop}'da dur, hedef {target}'a ulaşmak gerçekçi mi?

Türkçe yaz. "AL" veya "SAT" deme — sadece analiz yap, karar kullanıcıya ait."""
```

- [ ] **Step 4: Testlerin geçtiğini doğrula**

```bash
cd /Users/emrullah/developer/fullStack/borsa/backend/services/service-ai
pytest test_prompt.py -v 2>&1 | tail -15
```

Expected: 7 test PASS

---

## Task 3: ollama_client.py + /analyze endpoint

**Files:**
- Create: `backend/services/service-ai/ollama_client.py`
- Modify: `backend/services/service-ai/main.py`
- Test: `backend/services/service-ai/test_analyze.py`

- [ ] **Step 1: ollama_client.py yaz**

`backend/services/service-ai/ollama_client.py`:
```python
import httpx

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen2.5:latest"
TIMEOUT = 30.0


async def generate(prompt: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                OLLAMA_URL,
                json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("response", "").strip() or None
    except Exception:
        return None
```

- [ ] **Step 2: Failing test yaz**

`backend/services/service-ai/test_analyze.py`:
```python
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch
from main import app


@pytest.mark.asyncio
async def test_analyze_returns_comment_when_ollama_ok():
    mock_comment = "RSI aşırı satım bölgesinde, güçlü bir toparlanma sinyali var."
    with patch("main.ollama_generate", new=AsyncMock(return_value=mock_comment)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/analyze", json={
                "symbol": "BTCUSDT",
                "direction": "long",
                "entryPrice": 78420.0,
                "stopPrice": 78180.0,
                "targetPrice": 78780.0,
                "rrRatio": 1.5,
                "confluenceScore": 0.87,
                "indicatorsSnapshot": {"rsi": 28.4, "ema9": 78450.0, "ema21": 78380.0, "macdHistogram": 0.12, "atr": 240.0},
            })
    assert resp.status_code == 200
    data = resp.json()
    assert data["comment"] == mock_comment


@pytest.mark.asyncio
async def test_analyze_returns_null_when_ollama_fails():
    with patch("main.ollama_generate", new=AsyncMock(return_value=None)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/analyze", json={
                "symbol": "ETHUSDT",
                "direction": "short",
                "entryPrice": 3115.0,
                "stopPrice": 3148.0,
                "targetPrice": 3065.0,
                "rrRatio": 1.5,
                "confluenceScore": 0.71,
                "indicatorsSnapshot": None,
            })
    assert resp.status_code == 200
    assert resp.json()["comment"] is None


@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
```

- [ ] **Step 3: Test'in fail ettiğini doğrula**

```bash
cd /Users/emrullah/developer/fullStack/borsa/backend/services/service-ai
pytest test_analyze.py -v 2>&1 | tail -15
```

Expected: FAIL — `cannot import name 'ollama_generate' from 'main'`

- [ ] **Step 4: main.py'yi güncelle — /analyze endpoint'i tamamla**

`backend/services/service-ai/main.py` TAM OLARAK şöyle yaz:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from ollama_client import generate as ollama_generate
from prompt import build_prompt

app = FastAPI(title="Scalp Bot AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5180"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class Signal(BaseModel):
    symbol: str
    direction: str
    entryPrice: float
    stopPrice: float
    targetPrice: float
    rrRatio: float
    confluenceScore: float
    indicatorsSnapshot: Optional[dict] = None


@app.get("/health")
def health():
    return {"status": "ok", "service": "service-ai"}


@app.post("/analyze")
async def analyze(signal: Signal):
    prompt = build_prompt(signal.model_dump())
    comment = await ollama_generate(prompt)
    return {"comment": comment}
```

- [ ] **Step 5: Testlerin geçtiğini doğrula**

```bash
cd /Users/emrullah/developer/fullStack/borsa/backend/services/service-ai
pytest test_analyze.py -v 2>&1 | tail -15
```

Expected: 3 test PASS

- [ ] **Step 6: Tüm Python testleri çalıştır**

```bash
cd /Users/emrullah/developer/fullStack/borsa/backend/services/service-ai
pytest -v 2>&1 | tail -20
```

Expected: 10 test PASS (7 prompt + 3 analyze)

---

## Task 4: Frontend — aiApi.js

**Files:**
- Create: `frontend/src/api/aiApi.js`
- Test: `frontend/src/api/aiApi.test.js`

- [ ] **Step 1: Failing test yaz**

`frontend/src/api/aiApi.test.js`:
```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeSignal } from './aiApi.js';

const SAMPLE_SIGNAL = {
  symbol: 'BTCUSDT',
  direction: 'long',
  entryPrice: 78420,
  stopPrice: 78180,
  targetPrice: 78780,
  rrRatio: 1.5,
  confluenceScore: 0.87,
  indicatorsSnapshot: { rsi: 28.4, ema9: 78450, ema21: 78380, macdHistogram: 0.12, atr: 240 },
};

describe('analyzeSignal', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => vi.restoreAllMocks());

  it('POST /analyze çağırır ve comment döner', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ comment: 'RSI aşırı satım bölgesinde.' }),
    });
    const result = await analyzeSignal(SAMPLE_SIGNAL);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/analyze'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toBe('RSI aşırı satım bölgesinde.');
  });

  it('fetch hatası durumunda null döner', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));
    const result = await analyzeSignal(SAMPLE_SIGNAL);
    expect(result).toBeNull();
  });

  it('comment null gelirse null döner', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ comment: null }),
    });
    const result = await analyzeSignal(SAMPLE_SIGNAL);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Test'in fail ettiğini doğrula**

```bash
cd /Users/emrullah/developer/fullStack/borsa/frontend && npx vitest run src/api/aiApi.test.js
```

Expected: FAIL — modül yok

- [ ] **Step 3: aiApi.js yaz**

`frontend/src/api/aiApi.js`:
```js
const BASE = import.meta.env.VITE_AI_URL ?? 'http://localhost:3110';

export async function analyzeSignal(signal) {
  try {
    const res = await fetch(`${BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signal),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.comment ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: .env'e AI URL ekle**

`frontend/.env` dosyasına ekle (mevcut satırların altına):
```
VITE_AI_URL=http://localhost:3110
```

- [ ] **Step 5: Test geçtiğini doğrula**

```bash
cd /Users/emrullah/developer/fullStack/borsa/frontend && npx vitest run src/api/aiApi.test.js
```

Expected: 3 test PASS

---

## Task 5: DetailPanel güncelle — LLM yorum + loading + fallback

**Files:**
- Modify: `frontend/src/components/DetailPanel.jsx`
- Modify: `frontend/src/components/DetailPanel.test.jsx`

- [ ] **Step 1: Test dosyasını güncelle**

`frontend/src/components/DetailPanel.test.jsx` TAM OLARAK yeniden yaz:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DetailPanel from './DetailPanel.jsx';
import { useStore } from '../store/useStore.js';

vi.mock('../api/marketApi.js', () => ({
  fetchCandles: vi.fn().mockResolvedValue([]),
}));
vi.mock('../api/aiApi.js', () => ({
  analyzeSignal: vi.fn().mockResolvedValue('RSI aşırı satım bölgesinde, güçlü long sinyali.'),
}));

const MOCK_SIGNAL = {
  id: '1',
  symbol: 'BTCUSDT',
  direction: 'long',
  entryPrice: 78420,
  stopPrice: 78180,
  targetPrice: 78780,
  rrRatio: 1.5,
  confluenceScore: 0.87,
  indicatorsSnapshot: { rsi: 28, ema9: 100, ema21: 98, macdHistogram: 0.1, atr: 240 },
  createdAt: new Date().toISOString(),
};

beforeEach(() => useStore.setState({ selectedSignal: null }));

describe('DetailPanel', () => {
  it('sinyal seçilmemişken placeholder gösterir', () => {
    render(<DetailPanel />);
    expect(screen.getByText(/sinyal seç/i)).toBeInTheDocument();
  });

  it('sinyal seçilince yükleniyor gösterir', () => {
    useStore.setState({ selectedSignal: MOCK_SIGNAL });
    render(<DetailPanel />);
    expect(screen.getByText(/analiz yapılıyor/i)).toBeInTheDocument();
  });

  it('LLM yorumu gelince gösterir', async () => {
    useStore.setState({ selectedSignal: MOCK_SIGNAL });
    render(<DetailPanel />);
    await waitFor(() => {
      expect(screen.getByText(/RSI aşırı satım/)).toBeInTheDocument();
    });
  });

  it('sembol ve yön gösterir', () => {
    useStore.setState({ selectedSignal: MOCK_SIGNAL });
    render(<DetailPanel />);
    expect(screen.getByText(/BTCUSDT/)).toBeInTheDocument();
    expect(screen.getByText(/LONG/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Test'in fail ettiğini doğrula**

```bash
cd /Users/emrullah/developer/fullStack/borsa/frontend && npx vitest run src/components/DetailPanel.test.jsx
```

Expected: FAIL — "analiz yapılıyor" metni yok, LLM yorum testi başarısız

- [ ] **Step 3: DetailPanel.jsx güncelle**

`frontend/src/components/DetailPanel.jsx` TAM OLARAK şöyle yaz:
```jsx
import { useEffect, useState } from 'react';
import { Box, Typography, Chip, CircularProgress } from '@mui/material';
import { useStore } from '../store/useStore.js';
import { fetchCandles } from '../api/marketApi.js';
import { analyzeSignal } from '../api/aiApi.js';
import SignalChart from './SignalChart.jsx';
import AiComment from './AiComment.jsx';
import MetricRow from './MetricRow.jsx';
import { generateAiComment } from '../utils/aiComment.js';
import { COLORS } from '../theme.js';

export default function DetailPanel() {
  const signal = useStore((s) => s.selectedSignal);
  const [candles, setCandles] = useState([]);
  const [aiComment, setAiComment] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (!signal) return;
    setCandles([]);
    setAiComment(null);
    fetchCandles(signal.symbol, '1m', 60).then(setCandles);
    setAiLoading(true);
    analyzeSignal(signal).then((comment) => {
      setAiComment(comment);
      setAiLoading(false);
    });
  }, [signal?.id]);

  if (!signal) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>
        <Typography>← Soldan bir sinyal seç</Typography>
      </Box>
    );
  }

  const displayComment = aiComment ?? generateAiComment(signal);
  const dirColor = signal.direction === 'long' ? COLORS.long : COLORS.short;
  const dirLabel = signal.direction === 'long' ? '▲ LONG' : '▼ SHORT';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 1.5, gap: 1.5, overflowY: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography variant="h6" sx={{ color: dirColor, fontWeight: 700 }}>{dirLabel}</Typography>
        <Typography variant="h6" sx={{ color: COLORS.text }}>{signal.symbol}</Typography>
        <Chip size="small" label={`Confluence ${signal.confluenceScore?.toFixed(2)}`} sx={{ bgcolor: '#26a69a22', color: COLORS.long }} />
      </Box>
      <Box sx={{ flex: 2, minHeight: 0 }}>
        <SignalChart candles={candles} signal={signal} />
      </Box>
      {aiLoading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, bgcolor: '#161b22', borderRadius: 1, borderLeft: '3px solid #58a6ff' }}>
          <CircularProgress size={14} sx={{ color: '#58a6ff' }} />
          <Typography variant="body2" sx={{ color: '#8b949e', fontStyle: 'italic' }}>
            Analiz yapılıyor...
          </Typography>
        </Box>
      ) : (
        <AiComment text={displayComment} />
      )}
      <MetricRow
        entryPrice={signal.entryPrice}
        stopPrice={signal.stopPrice}
        targetPrice={signal.targetPrice}
        rrRatio={signal.rrRatio}
      />
    </Box>
  );
}
```

- [ ] **Step 4: Test geçtiğini doğrula**

```bash
cd /Users/emrullah/developer/fullStack/borsa/frontend && npx vitest run src/components/DetailPanel.test.jsx
```

Expected: 4 test PASS

- [ ] **Step 5: Tüm frontend testlerini çalıştır**

```bash
cd /Users/emrullah/developer/fullStack/borsa/frontend && npx vitest run
```

Expected: tüm testler PASS

- [ ] **Step 6: Build doğrula**

```bash
cd /Users/emrullah/developer/fullStack/borsa/frontend && npm run build
```

Expected: build başarılı.

---

## Çalıştırma (manuel doğrulama)

Servisleri başlat:
```bash
# Terminal 1 — Ollama (zaten çalışıyor olmalı)
# ollama serve

# Terminal 2 — AI service
cd /Users/emrullah/developer/fullStack/borsa/backend/services/service-ai
uvicorn main:app --port 3110 --reload

# Terminal 3 — signal-engine
cd /Users/emrullah/developer/fullStack/borsa/backend
npm run dev:signal-engine

# Terminal 4 — market-data
cd /Users/emrullah/developer/fullStack/borsa/backend
npm run dev:market-data

# Terminal 5 — frontend
cd /Users/emrullah/developer/fullStack/borsa/frontend
npm run dev
```

Test: `http://localhost:5180` → sol listeden sinyal seç → "Analiz yapılıyor..." → Ollama yorumu gelir.

---

## Self-Review

**Spec coverage:**
- ✅ Python FastAPI servis, port 3110 — Task 1
- ✅ `build_prompt` saf fonksiyon, Türkçe halk dili, RSI/EMA/MACD/ATR yorumları — Task 2
- ✅ Ollama HTTP client, timeout 30s, hata → None — Task 3
- ✅ CORS `localhost:5180` — Task 1 (main.py)
- ✅ `POST /analyze` endpoint, mock test ile — Task 3
- ✅ Frontend `analyzeSignal()` — Task 4
- ✅ `VITE_AI_URL` env var — Task 4
- ✅ DetailPanel: loading spinner, LLM yorum, fallback mock — Task 5
- ✅ HTTP 200 her zaman (hata → comment null) — Task 3 (ollama_client.py None döner)

**Placeholder tarama:** Yok.

**Type consistency:**
- `signal.model_dump()` → Task 3 main.py → `build_prompt(signal: dict)` Task 2 ✓
- `analyzeSignal(signal)` → Task 4 → Task 5 DetailPanel ✓
- `comment` field adı: Task 3 response, Task 4 `data.comment`, Task 5 `setAiComment` hepsi tutarlı ✓
- `ollama_generate` import adı: Task 3 test mock'u `main.ollama_generate` patch ediyor, main.py'de `from ollama_client import generate as ollama_generate` ✓
