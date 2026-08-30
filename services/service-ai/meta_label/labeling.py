"""
Faz 3.3 (LightGBM meta-etiketleyici): etiket ikili — TP mi SL'den önce geldi.

'timeout' ve 'pending'/'cancelled' etiketlenmez (None döner, eğitim setinden
çıkarılmalı). Gerekçe: timeout mark-to-market kapanışıdır (evaluate-outcome.js) —
gerçek bir "sinyal kazandı/kaybetti" kararı değil, süre dolduğunda fiyatın nerede
olduğudur. Bunu 0/1'e zorlamak modele yanlış bir sinyal öğretir (sızıntı riski).
"""

_STATUS_TO_LABEL = {
    "tp_hit": 1,
    "sl_hit": 0,
}


def build_label(status: str):
    return _STATUS_TO_LABEL.get(status)
