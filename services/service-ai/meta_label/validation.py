"""
Faz 3.3 (purged k-fold + embargo): finans zaman serilerinde sıradan k-fold
doğrulama sızıntı üretir — komşu barların feature'ları (realized_volatility,
funding_z_score gibi kayan pencere hesapları) örtüştüğü için bir örneğin
"gelecekteki" komşusu train'de kalırsa test fold'u artık gerçekten
out-of-sample değildir.

purged_kfold_splits, her test fold'unun ETRAFINDAKİ embargo_bars kadar train
örneğini çıkarır (purge) — López de Prado'nun "Advances in Financial Machine
Learning" kitabındaki purged k-fold + embargo yönteminin basitleştirilmiş hali.

@param timestamps: artan sıralı zaman damgaları listesi (ms), örneklerin sırasını verir
@param n_splits: kaç fold
@param embargo_bars: her test fold'unun HEMEN SONRASINDAKİ kaç örnek train'den çıkarılsın
@yields (train_indices: list[int], test_indices: list[int])
"""


def purged_kfold_splits(timestamps, n_splits=5, embargo_bars=0):
    n = len(timestamps)
    fold_size = n // n_splits
    all_indices = list(range(n))

    for fold in range(n_splits):
        test_start = fold * fold_size
        test_end = test_start + fold_size if fold < n_splits - 1 else n
        test_idx = list(range(test_start, test_end))

        # Embargo: test fold'un HEMEN SONRASINDAKİ embargo_bars kadar örnek de
        # train'den çıkarılır — bu örnekler test fold'a komşu olduğu için kayan
        # pencere feature'ları (örn. son N mumun std'si) test verisiyle örtüşebilir.
        embargo_end = min(test_end + embargo_bars, n)
        purged_range = set(range(test_start, embargo_end))

        train_idx = [i for i in all_indices if i not in purged_range]
        yield train_idx, test_idx
