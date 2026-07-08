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
