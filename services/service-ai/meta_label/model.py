"""
Faz 3.3 (LightGBM meta-etiketleyici): inference katmanı.

Doğru mimari (plan): birincil model (mevcut confluence.js kural motoru) ADAY
sinyaller üretir; bu model SİNYAL ÜRETMEZ, o adayları FİLTRELER. Çıktı P(win) —
eşik üstündeyse işlem, boyut P(win) ile orantılı olabilir (Faz 5'te).
"""

from dataclasses import dataclass
from features import FEATURE_NAMES


@dataclass
class MetaLabelModel:
    booster: object  # lightgbm.Booster
    trained_at: str = None
    training_n: int = None


def predict_win_probability(model: MetaLabelModel, feature_vector: list) -> float:
    if len(feature_vector) != len(FEATURE_NAMES):
        raise ValueError(
            f"feature_vector uzunluğu {len(feature_vector)}, beklenen {len(FEATURE_NAMES)} "
            f"(FEATURE_NAMES: {FEATURE_NAMES})"
        )
    prediction = model.booster.predict([feature_vector])
    return float(prediction[0])
