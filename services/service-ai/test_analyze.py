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
