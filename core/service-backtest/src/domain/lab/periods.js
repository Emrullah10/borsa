// Lab (2026-09-30) — dönemler ÖNCEDEN sabitlendi (spec: strateji-laboratuvari-design).
// Sonuçlara bakıp değiştirilemez. Bitiş HARİÇ, başlangıç DAHİL.
//
// train:      parametre seçimi
// validation: seçilen aday burada ≤0 ise holdout hiç AÇILMAZ
// holdout:    nihai sınav — aday başına TEK kez (holdout-lock.js)
//
// train 2024-05-01'de başlar (günlük veri 2024-04-04'ten): faktör ısınması için ~1 ay
// (en uzun geri bakış 30 gün) bırakıldı.
export const PERIODS = {
  train:      { start: Date.UTC(2024, 4, 1), end: Date.UTC(2025, 6, 1) },
  validation: { start: Date.UTC(2025, 6, 1), end: Date.UTC(2026, 0, 1) },
  holdout:    { start: Date.UTC(2026, 0, 1), end: Date.UTC(2026, 9, 1) },
};

export function periodOf(ts) {
  for (const [name, { start, end }] of Object.entries(PERIODS)) {
    if (ts >= start && ts < end) return name;
  }
  return null;
}
