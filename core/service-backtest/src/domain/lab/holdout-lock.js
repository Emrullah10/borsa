// Lab (2026-09-30) — holdout aday başına TEK kez açılır. Aynı ayarla tekrar açmak serbest
// (deterministik, aynı sonucu üretir); FARKLI ayarla ikinci açılış = sonuca bakıp ayar oynama →
// reddedilir, --force-reopen ile yapılırsa rapor "KİRLİ" işaretlenir.
export function makeHoldoutLock({ read, write }) {
  const load = () => read() ?? {};

  function tryOpen(family, config, { force = false, now = new Date().toISOString() } = {}) {
    const s = load();
    const existing = s[family];
    if (!existing) {
      write({ ...s, [family]: { config, openedAt: now, dirty: false } });
      return { allowed: true, dirty: false };
    }
    if (JSON.stringify(existing.config) === JSON.stringify(config)) return { allowed: true, dirty: existing.dirty };
    if (!force) {
      return {
        allowed: false, dirty: false,
        reason: `${family} holdout'u daha önce FARKLI bir ayarla açıldı (${JSON.stringify(existing.config)}); tek kez kuralı gereği reddedildi. --force-reopen ile açılırsa rapor KİRLİ işaretlenir.`,
      };
    }
    write({ ...s, [family]: { config, openedAt: now, dirty: true, previous: existing } });
    return { allowed: true, dirty: true };
  }

  return { tryOpen, state: load };
}
