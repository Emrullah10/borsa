"""
Faz 3.4 (LLM'in tek görevi: olay vetosu).

Doğru mimari (kullanıcının istediği yapı): LLM sinyal ÜRETMEZ, yön SÖYLEMEZ —
sadece "bu sembolde/şu an işlem yapmayı engelleyen bir olay var mı" sorusuna
cevap verir (borsa kesintisi, token unlock, hack, makro takvim — FOMC, CPI vb.).
Bu, ölü signals.ai_approved/ai_confidence/ai_reason kolonlarının (02-signals.sql,
hiçbir kod yazmıyordu) nihayet kullanıldığı yerdir.

Günde 1-3 sinyal hedefiyle (kullanıcı kararı) ayda ~90 çağrı — $5-20/ay bütçe
fazlasıyla yeterli. Fail-open tasarım: LLM cevap veremezse/parse edilemezse
None döner, çağıran taraf normal akışa (AI vetosu olmadan) devam eder — LLM tek
nokta arıza olmamalı.
"""

import json
import re

REQUIRED_FIELDS = {"approved", "confidence", "reason"}


def build_veto_prompt(symbol: str, direction: str) -> str:
    return f"""Sen bir kripto piyasası olay tarayıcısısın. GÖREVİN DAR: SADECE şu an {symbol}
üzerinde işlem açmayı riskli/anlamsız kılacak GÜNCEL bir OLAY olup olmadığını
değerlendir — borsa bakımı/kesintisi, büyük token unlock, hack/güvenlik olayı,
delist duyurusu, önemli bir makro takvim olayı (FOMC, CPI vb.) şu an gerçekleşiyor mu.

YÖN TAVSİYESİ VERME. Fiyatın gidebileceği yön hakkında hiçbir yorum yapma — bu
senin görevin değil, kararı teknik sinyal zaten verdi. Senin tek işin: "işlem
açmak için engelleyen bir olay var mı" sorusuna onay/red vermek.

SADECE şu JSON formatında cevap ver, başka hiçbir metin ekleme:
{{"approved": true/false, "confidence": 0.0-1.0, "reason": "kısa Türkçe gerekçe"}}

approved=false SADECE somut, güncel bir olay biliyorsan. Emin değilsen approved=true
ve confidence düşük ver — belirsizlik bir veto sebebi DEĞİLDİR, sadece gerçek bir
olay vetodur."""


def parse_veto_response(raw):
    if not raw:
        return None

    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return None

    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None

    if not REQUIRED_FIELDS.issubset(data.keys()):
        return None

    try:
        return {
            "approved": bool(data["approved"]),
            "confidence": float(data["confidence"]),
            "reason": str(data["reason"]),
        }
    except (TypeError, ValueError):
        return None
