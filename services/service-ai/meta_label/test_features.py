import pytest
from features import extract_feature_vector, FEATURE_NAMES

# Faz 3.3 (LightGBM meta-etiketleyici): indicators_snapshot (signals.indicators_snapshot,
# core/service-signal-engine tarafından yazılan JSONB) satırından sabit sıralı bir
# feature vektörü çıkarır. Eksik/None bir feature SESSİZCE 0'a düşmez — modelin
# kendisi (LightGBM) NaN'ı doğal olarak işleyebilir, bu yüzden eksik değer np.nan
# olarak taşınır (uydurma yok — Faz 3.2 ile aynı ilke).


SAMPLE_SNAPSHOT = {
    "rsi": 55.2,
    "adx": 28.4,
    "atr": 120.5,
    "currentPrice": 67000.0,
    "volumeRatio": 1.8,
    "bb": {"pb": 0.62},
    "mlFeatures": {
        "fundingZScore": 1.2,
        "oiDelta1h": 50000,
        "realizedVolatility": 0.004,
        "hourOfDayUtc": 14,
        "btcCorrelation": None,
        "distToSupportPct": 0.02,
        "distToResistancePct": 0.05,
        "liquidityTier": None,
        "spreadPct": None,
    },
}


def test_extract_feature_vector_returns_fixed_length_list():
    vec = extract_feature_vector(SAMPLE_SNAPSHOT)
    assert len(vec) == len(FEATURE_NAMES)


def test_extract_feature_vector_maps_known_fields_correctly():
    vec = extract_feature_vector(SAMPLE_SNAPSHOT)
    as_dict = dict(zip(FEATURE_NAMES, vec))
    assert as_dict["rsi"] == 55.2
    assert as_dict["adx"] == 28.4
    assert as_dict["funding_z_score"] == 1.2
    assert as_dict["oi_delta_1h"] == 50000
    assert as_dict["hour_of_day_utc"] == 14


def test_missing_mlfeatures_key_becomes_nan_not_zero():
    # Eski sinyaller (Faz 3.1 öncesi) mlFeatures taşımıyor — sessizce 0 DEĞİL, NaN.
    snapshot_without_ml = {"rsi": 50, "adx": 20, "atr": 100, "currentPrice": 100, "volumeRatio": 1, "bb": {"pb": 0.5}}
    vec = extract_feature_vector(snapshot_without_ml)
    as_dict = dict(zip(FEATURE_NAMES, vec))
    assert as_dict["funding_z_score"] != as_dict["funding_z_score"]  # NaN != NaN


def test_none_liquidity_tier_becomes_nan():
    vec = extract_feature_vector(SAMPLE_SNAPSHOT)
    as_dict = dict(zip(FEATURE_NAMES, vec))
    # liquidityTier kategorik + None → sayısal kodlamada NaN
    assert as_dict["liquidity_tier_code"] != as_dict["liquidity_tier_code"]


def test_liquidity_tier_encoding():
    for tier, expected in [("low", 0), ("mid", 1), ("high", 2)]:
        snap = {**SAMPLE_SNAPSHOT, "mlFeatures": {**SAMPLE_SNAPSHOT["mlFeatures"], "liquidityTier": tier}}
        vec = extract_feature_vector(snap)
        as_dict = dict(zip(FEATURE_NAMES, vec))
        assert as_dict["liquidity_tier_code"] == expected


def test_completely_empty_snapshot_does_not_raise():
    vec = extract_feature_vector({})
    assert len(vec) == len(FEATURE_NAMES)
