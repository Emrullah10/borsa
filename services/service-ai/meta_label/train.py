"""
Faz 3.3 (LightGBM meta-etiketleyici) — eğitim CLI.

Kullanım:
    cd services/service-ai
    .venv/bin/python meta_label/train.py --days 90

Eğitim seti: signals JOIN signal_outcomes WHERE status IN ('tp_hit','sl_hit')
(timeout/pending hariç — bkz. labeling.py). Doğrulama: purged k-fold + embargo
(bkz. validation.py) — sıradan k-fold finans zaman serilerinde sızıntı üretir.

⚠️ Bu script agent ortamında ÇALIŞTIRILAMADI — gerçek Bitget/DB verisi gerektirir.
Kod doğruluğu birim testlerle (features.py, labeling.py, validation.py, model.py)
doğrulanmıştır; gerçek veriyle eğitim, kalıcı mum deposu (Faz 1.5) + backfill
(services/service-backtest/src/backfill-candles.js) sonrası mümkün olacaktır.

MİNİMUM VERİ UYARISI: canlıda günde 1-3 sinyal hedefleniyor (kullanıcı kararı) —
500-1000 örnek birikmesi 6-12 ay sürer. Faz 1.5'teki backtest sinyalleri
(runStrategyOverCandles ile üretilen, gerçek geçmiş mumlar üzerinde) bu yüzden
eğitim setinin asıl kaynağı olmalı — canlı sinyaller sadece doğrulama/yeniden
eğitim için kullanılır.
"""

import argparse
import json
import os
import pickle
import sys
from datetime import datetime, timezone

import lightgbm as lgb
import numpy as np
import psycopg2

from features import extract_feature_vector, FEATURE_NAMES
from labeling import build_label
from validation import purged_kfold_splits

MODEL_OUT_PATH = os.path.join(os.path.dirname(__file__), "model.pkl")


def fetch_training_rows(database_url, days):
    """signals + signal_outcomes'tan (status IN tp_hit/sl_hit) eğitim satırlarını çeker."""
    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.indicators_snapshot, o.status, s.created_at
                FROM signals s
                JOIN signal_outcomes o ON o.signal_id = s.id
                WHERE o.status IN ('tp_hit', 'sl_hit')
                  AND s.created_at > now() - make_interval(days => %s)
                ORDER BY s.created_at ASC
                """,
                (days,),
            )
            return cur.fetchall()
    finally:
        conn.close()


def build_dataset(rows):
    X, y, timestamps = [], [], []
    skipped = 0
    for snapshot, status, created_at in rows:
        label = build_label(status)
        if label is None:
            skipped += 1
            continue
        snapshot_dict = snapshot if isinstance(snapshot, dict) else json.loads(snapshot)
        X.append(extract_feature_vector(snapshot_dict))
        y.append(label)
        timestamps.append(created_at.timestamp() * 1000)
    return np.array(X), np.array(y), timestamps, skipped


def train_with_purged_cv(X, y, timestamps, n_splits=5, embargo_bars=10):
    """Purged k-fold ile modeli eğitir ve her fold'un AUC'sini raporlar."""
    aucs = []
    for fold_idx, (train_idx, test_idx) in enumerate(purged_kfold_splits(timestamps, n_splits, embargo_bars)):
        if len(set(y[train_idx])) < 2 or len(test_idx) == 0:
            print(f"[fold {fold_idx}] atlandı — tek sınıf veya boş test fold")
            continue
        train_data = lgb.Dataset(X[train_idx], label=y[train_idx])
        booster = lgb.train(
            {"objective": "binary", "metric": "auc", "verbosity": -1, "num_leaves": 15, "min_data_in_leaf": 20},
            train_data,
            num_boost_round=100,
        )
        preds = booster.predict(X[test_idx])
        # Basit AUC (sklearn kullanmadan) — roc_auc_score tercih edilir ama
        # bağımlılık zaten var, doğrudan onu kullanıyoruz:
        from sklearn.metrics import roc_auc_score

        try:
            auc = roc_auc_score(y[test_idx], preds)
            aucs.append(auc)
            print(f"[fold {fold_idx}] n_train={len(train_idx)} n_test={len(test_idx)} AUC={auc:.4f}")
        except ValueError as e:
            print(f"[fold {fold_idx}] AUC hesaplanamadı: {e}")

    # Final model: TÜM veriyle (purged CV sadece genelleme performansını ölçmek için)
    final_data = lgb.Dataset(X, label=y)
    final_booster = lgb.train(
        {"objective": "binary", "metric": "auc", "verbosity": -1, "num_leaves": 15, "min_data_in_leaf": 20},
        final_data,
        num_boost_round=100,
    )
    return final_booster, aucs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=90)
    parser.add_argument("--n-splits", type=int, default=5)
    parser.add_argument("--embargo-bars", type=int, default=10)
    parser.add_argument("--min-samples", type=int, default=200, help="bu sayının altında eğitim REDDEDİLİR")
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("[train] DATABASE_URL tanımlı değil.", file=sys.stderr)
        sys.exit(1)

    print(f"[train] Eğitim verisi çekiliyor (son {args.days} gün)...")
    rows = fetch_training_rows(database_url, args.days)
    X, y, timestamps, skipped = build_dataset(rows)
    print(f"[train] {len(X)} etiketlenebilir örnek, {skipped} atlandı (timeout/pending).")

    if len(X) < args.min_samples:
        print(
            f"[train] REDDEDİLDİ: {len(X)} örnek < min-samples={args.min_samples}. "
            f"Küçük örneklemde model overfitting riski çok yüksek — daha çok veri gerekiyor.",
            file=sys.stderr,
        )
        sys.exit(1)

    booster, aucs = train_with_purged_cv(X, y, timestamps, args.n_splits, args.embargo_bars)
    mean_auc = float(np.mean(aucs)) if aucs else None
    print(f"[train] Ortalama purged-CV AUC: {mean_auc}")

    if mean_auc is not None and mean_auc < 0.52:
        print(
            "[train] UYARI: AUC 0.52'nin altında — model rastgele tahminden ayırt edilemiyor. "
            "Bu modeli DEPLOY ETME.",
            file=sys.stderr,
        )

    with open(MODEL_OUT_PATH, "wb") as f:
        pickle.dump(
            {
                "booster": booster,
                "feature_names": FEATURE_NAMES,
                "trained_at": datetime.now(timezone.utc).isoformat(),
                "training_n": len(X),
                "mean_cv_auc": mean_auc,
            },
            f,
        )
    print(f"[train] Model kaydedildi: {MODEL_OUT_PATH}")


if __name__ == "__main__":
    main()
