import numpy as np
import pytest
from datetime import datetime, timezone

from train import build_dataset, train_with_purged_cv


class FakeTs:
    """psycopg2'nin datetime döndürdüğü satırları taklit eder (.timestamp() metodu)."""

    def __init__(self, ms):
        self._dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)

    def timestamp(self):
        return self._dt.timestamp()


def make_row(rsi, status, ts_ms):
    snapshot = {"rsi": rsi, "adx": 20, "atr": 100, "currentPrice": 100, "volumeRatio": 1, "bb": {"pb": 0.5}}
    return (snapshot, status, FakeTs(ts_ms))


def test_build_dataset_excludes_timeout_and_pending():
    rows = [
        make_row(60, "tp_hit", 1000),
        make_row(40, "sl_hit", 2000),
        make_row(50, "timeout", 3000),
        make_row(50, "pending", 4000),
    ]
    X, y, ts, skipped = build_dataset(rows)
    assert len(X) == 2
    assert skipped == 2
    assert list(y) == [1, 0]


def test_build_dataset_handles_json_string_snapshot():
    import json

    snapshot = {"rsi": 55, "adx": 20, "atr": 100, "currentPrice": 100, "volumeRatio": 1, "bb": {"pb": 0.5}}
    rows = [(json.dumps(snapshot), "tp_hit", FakeTs(1000))]
    X, y, ts, skipped = build_dataset(rows)
    assert len(X) == 1
    assert skipped == 0


def test_train_with_purged_cv_produces_a_booster():
    rng = np.random.default_rng(7)
    n = 300
    X = rng.normal(size=(n, 13))
    y = (X[:, 0] > 0).astype(int)
    timestamps = list(range(n))

    booster, aucs = train_with_purged_cv(X, y, timestamps, n_splits=5, embargo_bars=5)

    assert booster is not None
    assert len(aucs) > 0
    # Ayrılabilir sentetik veri — AUC rastgeleden (0.5) belirgin yüksek olmalı
    assert np.mean(aucs) > 0.6
