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
