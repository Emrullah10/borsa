const BASE = import.meta.env.VITE_SIGNAL_URL ?? 'http://localhost:3102';

/**
 * Gerçek dolum fiyatını kaydeder (Faz 1 — kayma doğrulaması).
 *
 * NEDEN: Ölçülen edge'in ~%80'i giriş kaymasında kayboluyor (avg_sim_r=+0.037R
 * vs avg_r_after_fee=+0.183R). Model girişi "sonraki mumun açılışı ± %0.03"
 * varsayıyor — bu varsayımın doğru olup olmadığını ancak gerçek dolumlarla
 * karşılaştırarak bilebiliriz. Bu form o veriyi toplar.
 *
 * @param {string} outcomeId
 * @param {{realEntryPrice?:number|string, realExitPrice?:number|string, notes?:string}} fill
 */
export async function submitRealFill(outcomeId, { realEntryPrice, realExitPrice, notes } = {}) {
  if (!outcomeId) return { ok: false, error: 'Bu sinyalin sonuç kaydı yok' };

  // Boş/geçersiz değerleri hiç gönderme — backend ikisi de yoksa 400 döner
  const body = {};
  const entry = parseFloat(realEntryPrice);
  const exit = parseFloat(realExitPrice);
  if (Number.isFinite(entry)) body.realEntryPrice = entry;
  if (Number.isFinite(exit)) body.realExitPrice = exit;
  if (notes) body.notes = notes;

  if (body.realEntryPrice == null && body.realExitPrice == null) {
    return { ok: false, error: 'Giriş veya çıkış fiyatı gerekli' };
  }
  if (body.realEntryPrice != null) body.realEntryAt = new Date().toISOString();

  try {
    const res = await fetch(`${BASE}/outcomes/${outcomeId}/real-fill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error ?? `Sunucu hatası (${res.status})` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Bağlantı kurulamadı' };
  }
}

/**
 * Model ne dedi vs gerçekte ne oldu — kayma farkını yüzde olarak hesaplar.
 * Pozitif = gerçek dolum modelden KÖTÜ (aleyhine kaymış).
 */
export function calcSlippageDiff({ direction, simEntryPrice, realEntryPrice }) {
  if (simEntryPrice == null || realEntryPrice == null || !simEntryPrice) return null;
  const raw = (realEntryPrice - simEntryPrice) / simEntryPrice;
  // Long'da yüksek giriş kötü, short'ta düşük giriş kötü
  const worse = direction === 'long' ? raw : -raw;
  return worse * 100;
}
