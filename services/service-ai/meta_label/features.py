"""
Faz 3.3 (LightGBM meta-etiketleyici): indicators_snapshot (signals.indicators_snapshot,
core/service-signal-engine/src/application/use-cases/make-process-candle.js:122-165
tarafından yazılan JSONB) satırından sabit sıralı bir feature vektörü çıkarır.

İLKE (Faz 3.2 ile aynı): eksik/None bir feature SESSİZCE 0'a düşmez. LightGBM NaN'ı
doğal olarak (split'lerde ayrı bir dal olarak) işleyebilir — bu yüzden eksik değer
np.nan olarak taşınır. Sessizce 0'a düşürmek, B7/B8'deki hatayla aynı sınıf hataya
yol açardı: "gerçekten eksik" ile "gerçekten sıfır" ayrımı kaybolur.
"""

import math

FEATURE_NAMES = [
    "rsi",
    "adx",
    "atr",
    "volume_ratio",
    "bb_pb",
    "funding_z_score",
    "oi_delta_1h",
    "realized_volatility",
    "hour_of_day_utc",
    "btc_correlation",
    "dist_to_support_pct",
    "dist_to_resistance_pct",
    "liquidity_tier_code",
]

_LIQUIDITY_TIER_CODES = {"low": 0, "mid": 1, "high": 2}

NAN = float("nan")


def _num_or_nan(value):
    if value is None:
        return NAN
    try:
        f = float(value)
        return f if not math.isnan(f) else NAN
    except (TypeError, ValueError):
        return NAN


def extract_feature_vector(snapshot: dict) -> list:
    """indicators_snapshot dict'inden FEATURE_NAMES sırasıyla sayısal bir liste döner."""
    snapshot = snapshot or {}
    ml = snapshot.get("mlFeatures") or {}
    bb = snapshot.get("bb") or {}

    liquidity_tier = ml.get("liquidityTier")
    liquidity_code = _LIQUIDITY_TIER_CODES.get(liquidity_tier, NAN)

    return [
        _num_or_nan(snapshot.get("rsi")),
        _num_or_nan(snapshot.get("adx")),
        _num_or_nan(snapshot.get("atr")),
        _num_or_nan(snapshot.get("volumeRatio")),
        _num_or_nan(bb.get("pb")),
        _num_or_nan(ml.get("fundingZScore")),
        _num_or_nan(ml.get("oiDelta1h")),
        _num_or_nan(ml.get("realizedVolatility")),
        _num_or_nan(ml.get("hourOfDayUtc")),
        _num_or_nan(ml.get("btcCorrelation")),
        _num_or_nan(ml.get("distToSupportPct")),
        _num_or_nan(ml.get("distToResistancePct")),
        liquidity_code,
    ]
