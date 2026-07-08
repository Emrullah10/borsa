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
