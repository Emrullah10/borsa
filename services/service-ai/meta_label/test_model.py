import pytest
import numpy as np
import lightgbm as lgb
from model import predict_win_probability, MetaLabelModel

# Faz 3.3: inference katmanı. Gerçek bir eğitilmiş modelle P(win) tahmini üretir.
# Eğitim (train.py) gerçek DB verisi gerektirir — bu test dosyası SADECE
# inference sözleşmesini (predict_win_probability) küçük, sentetik bir modelle
# doğrular.


@pytest.fixture
def tiny_model():
    # Çok küçük, deterministik bir LightGBM modeli — sadece arayüzü test etmek için.
    rng = np.random.default_rng(42)
    X = rng.normal(size=(200, 13))
    y = (X[:, 0] > 0).astype(int)  # ilk feature işaretine bağlı basit ayrılabilir etiket
    train_data = lgb.Dataset(X, label=y)
    booster = lgb.train(
        {"objective": "binary", "verbosity": -1, "num_leaves": 4, "min_data_in_leaf": 5},
        train_data,
        num_boost_round=10,
    )
    return MetaLabelModel(booster=booster)


def test_predict_win_probability_returns_value_between_0_and_1(tiny_model):
    feature_vector = [0.5] * 13
    p = predict_win_probability(tiny_model, feature_vector)
    assert 0.0 <= p <= 1.0


def test_predict_win_probability_handles_nan_features(tiny_model):
    # NaN feature'lar LightGBM'e sorunsuz geçmeli (features.py NaN üretebiliyor)
    feature_vector = [float("nan")] * 13
    p = predict_win_probability(tiny_model, feature_vector)
    assert 0.0 <= p <= 1.0


def test_predict_win_probability_wrong_length_raises():
    class FakeModel:
        pass

    with pytest.raises(ValueError):
        predict_win_probability(FakeModel(), [1, 2, 3])  # 13 değil
