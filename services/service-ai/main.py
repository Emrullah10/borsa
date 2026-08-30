from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from ollama_client import generate as ollama_generate
from prompt import build_prompt
from event_veto import build_veto_prompt, parse_veto_response

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


class VetoRequest(BaseModel):
    symbol: str
    direction: str


# Faz 3.4 (LLM'in tek görevi: olay vetosu). LLM sinyal ÜRETMEZ, yön SÖYLEMEZ —
# sadece "bu sembolde işlem yapmayı engelleyen güncel bir olay var mı" sorusuna
# cevap verir. FAIL-OPEN: LLM cevap veremezse/parse edilemezse approved=True,
# confidence=0.0 döner — LLM tek nokta arıza olmamalı, normal akış AI vetosu
# olmadan devam etmeli. ai_approved/ai_confidence/ai_reason kolonları
# (02-signals.sql, önceden hiçbir kod yazmıyordu) bu endpoint'in çıktısıyla
# doldurulabilir hale gelir (yazma sorumluluğu çağıran serviste).
@app.post("/veto")
async def veto(req: VetoRequest):
    prompt = build_veto_prompt(symbol=req.symbol, direction=req.direction)
    raw = await ollama_generate(prompt)
    parsed = parse_veto_response(raw)
    if parsed is None:
        return {
            "approved": True,
            "confidence": 0.0,
            "reason": "AI vetosu değerlendirilemedi (LLM yanıt vermedi/parse edilemedi) — fail-open.",
        }
    return parsed
