import pytest
from event_veto import build_veto_prompt, parse_veto_response

# Faz 3.4 (LLM'in tek görevi: olay vetosu). LLM SİNYAL ÜRETMEZ, yön SÖYLEMEZ —
# sadece "bu sembolde/şu an işlem yapmayı engelleyen bir olay var mı" sorusuna
# cevap verir (borsa kesintisi, unlock, hack, makro takvim). Bu, ölü
# signals.ai_approved/ai_confidence/ai_reason kolonlarının (hiçbir kod
# yazmıyordu) nihayet kullanıldığı yer.


def test_build_veto_prompt_contains_symbol_and_asks_yes_no_style_question():
    prompt = build_veto_prompt(symbol="BTCUSDT", direction="long")
    assert "BTCUSDT" in prompt
    assert "onay" in prompt.lower() or "engelleyen" in prompt.lower() or "veto" in prompt.lower()


def test_build_veto_prompt_explicitly_forbids_direction_advice():
    prompt = build_veto_prompt(symbol="ETHUSDT", direction="short")
    # Prompt açıkça yön tavsiyesi vermemeyi istemeli (mevcut prompt.py'deki desenin aynısı)
    assert "yön" in prompt.lower() or "karar" in prompt.lower()


def test_parse_veto_response_valid_json():
    raw = '{"approved": true, "confidence": 0.8, "reason": "Belirgin bir olay yok"}'
    result = parse_veto_response(raw)
    assert result["approved"] is True
    assert result["confidence"] == 0.8
    assert result["reason"] == "Belirgin bir olay yok"


def test_parse_veto_response_json_wrapped_in_extra_text():
    # LLM'ler bazen JSON'ı düz metinle sarmalar — basit bir extraction toleransı
    raw = 'Tabii, işte analiz: {"approved": false, "confidence": 0.9, "reason": "Borsa bakımda"} Umarım yardımcı olur.'
    result = parse_veto_response(raw)
    assert result["approved"] is False
    assert result["reason"] == "Borsa bakımda"


def test_parse_veto_response_invalid_json_returns_fail_open_none():
    # Parse edilemezse None döner — çağıran taraf bunu "LLM cevap veremedi,
    # normal akışa devam et" olarak yorumlamalı (fail-open, fail-closed DEĞİL —
    # LLM bir bekçi, tek nokta arıza olmamalı).
    result = parse_veto_response("bu geçerli bir JSON değil")
    assert result is None


def test_parse_veto_response_missing_required_field_returns_none():
    raw = '{"approved": true}'  # confidence/reason eksik
    result = parse_veto_response(raw)
    assert result is None


def test_parse_veto_response_none_input_returns_none():
    assert parse_veto_response(None) is None
