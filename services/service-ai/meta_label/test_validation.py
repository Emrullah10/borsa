import pytest
from validation import purged_kfold_splits

# Faz 3.3 (purged k-fold + embargo): finans zaman serilerinde sıradan k-fold sızıntı
# üretir — bir trade'in feature'ları (ör. realized_volatility) komşu barlarla
# örtüştüğü için train/test arasında bilgi sızabilir. Purged k-fold, test
# fold'unun ETRAFINDAKİ (embargo_bars kadar) train örneklerini çıkarır (purge).


def make_timestamps(n, step_ms=60_000, start=0):
    return [start + i * step_ms for i in range(n)]


def test_returns_n_splits_folds():
    ts = make_timestamps(100)
    splits = list(purged_kfold_splits(ts, n_splits=5, embargo_bars=2))
    assert len(splits) == 5


def test_each_split_has_disjoint_train_test():
    ts = make_timestamps(100)
    for train_idx, test_idx in purged_kfold_splits(ts, n_splits=5, embargo_bars=2):
        assert set(train_idx).isdisjoint(set(test_idx))


def test_embargo_removes_train_samples_adjacent_to_test_fold():
    ts = make_timestamps(20)
    splits = list(purged_kfold_splits(ts, n_splits=4, embargo_bars=2))
    # İlk fold: test = [0..4], embargo=2 → train'den 5,6 index'leri PURGE edilmeli
    train_idx, test_idx = splits[0]
    assert 5 not in train_idx
    assert 6 not in train_idx
    assert 7 in train_idx  # embargo dışındaki komşu train'de kalmalı


def test_embargo_zero_means_no_purging_beyond_test_fold():
    ts = make_timestamps(20)
    splits_with_embargo = list(purged_kfold_splits(ts, n_splits=4, embargo_bars=0))
    train_idx, test_idx = splits_with_embargo[0]
    # embargo=0 iken test fold'un hemen dışındaki index train'de kalmalı
    max_test = max(test_idx)
    assert (max_test + 1) in train_idx or (max_test + 1) >= len(ts)


def test_all_indices_covered_across_test_folds():
    ts = make_timestamps(100)
    splits = list(purged_kfold_splits(ts, n_splits=5, embargo_bars=1))
    all_test_idx = set()
    for _, test_idx in splits:
        all_test_idx.update(test_idx)
    assert all_test_idx == set(range(100))
