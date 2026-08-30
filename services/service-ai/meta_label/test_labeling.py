import pytest
from labeling import build_label

# Faz 3.3: etiket ikili — TP mi SL'den önce geldi mi. Sadece status='tp_hit'/'sl_hit'
# etiketlenebilir; 'timeout'/'pending' belirsizdir (dahil edilmemeli — sızıntı riski:
# timeout mark-to-market kapanışı gerçek bir "kazandı/kaybetti" kararı değildir).


def test_tp_hit_labels_as_1():
    assert build_label("tp_hit") == 1


def test_sl_hit_labels_as_0():
    assert build_label("sl_hit") == 0


def test_timeout_labels_as_none_excluded_from_training():
    assert build_label("timeout") is None


def test_pending_labels_as_none():
    assert build_label("pending") is None


def test_cancelled_labels_as_none():
    assert build_label("cancelled") is None
