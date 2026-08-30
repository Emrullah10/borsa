import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch
from main import app

# Faz 3.4: POST /veto — LLM'in TEK görevi olay vetosu. ai_approved/ai_confidence/
# ai_reason (02-signals.sql, önceden hiçbir kod yazmıyordu) nihayet bu endpoint'in
# çıktısıyla doldurulabilir (yazma işlemi signal-engine tarafında, çağıran sorumlu).


@pytest.mark.asyncio
async def test_veto_returns_parsed_llm_response():
    mock_response = '{"approved": true, "confidence": 0.9, "reason": "Belirgin bir olay yok"}'
    with patch("main.ollama_generate", new=AsyncMock(return_value=mock_response)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/veto", json={"symbol": "BTCUSDT", "direction": "long"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["approved"] is True
    assert data["confidence"] == 0.9
    assert data["reason"] == "Belirgin bir olay yok"


@pytest.mark.asyncio
async def test_veto_fail_open_when_llm_unavailable():
    # LLM cevap veremezse (None) fail-open: approved=True, confidence=0, reason
    # açıklayıcı — normal akış AI vetosu OLMADAN devam etmeli, tek nokta arıza olmamalı.
    with patch("main.ollama_generate", new=AsyncMock(return_value=None)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/veto", json={"symbol": "ETHUSDT", "direction": "short"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["approved"] is True
    assert data["confidence"] == 0.0
    assert "reason" in data


@pytest.mark.asyncio
async def test_veto_fail_open_when_llm_returns_unparseable_response():
    with patch("main.ollama_generate", new=AsyncMock(return_value="rastgele metin, JSON değil")):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/veto", json={"symbol": "SOLUSDT", "direction": "long"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["approved"] is True  # fail-open
