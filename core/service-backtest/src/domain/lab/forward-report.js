// Lab (2026-09-30) — ileri-test raporu (saf string, sade Türkçe).
const DAY = 86_400_000;
const f = (x, d = 4) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));
const day = (ms) => (ms == null ? '—' : new Date(ms).toISOString().slice(0, 10));

const LABEL = { yetersiz: 'BEKLİYOR (yetersiz veri)', geçti: 'GEÇTİ', kaldı: 'KALDI' };

export function buildForwardReport({ generatedAt, forwardStart, now, results }) {
  const elapsed = Math.max(0, Math.floor((now - forwardStart) / DAY));
  const L = [];
  L.push('# İleri Test Raporu (kâğıt üstü)');
  L.push('');
  L.push(`Oluşturulma: ${generatedAt}`);
  L.push(`Başlangıç (dondurulmuş): ${day(forwardStart)} · Geçen süre: ${elapsed} gün`);
  L.push('');
  L.push('> Adaylar lab\'da seçilen ayarlarla **dondurulmuş** durumda; yalnızca başlangıçtan SONRAKİ taze veriyle ölçülür. **Kâğıt üstü**: para riski yok. Geçmiş 2026 holdout\'una bir daha bakılmaz.');
  L.push('');
  for (const r of results) {
    L.push(`## ${r.title} — ${LABEL[r.status] ?? r.status}`);
    if (r.status === 'yetersiz') {
      if (!r.n) {
        L.push('- Henüz ileri dönem verisi yok (ilk işlem günü başlangıç tarihidir).');
      } else {
        L.push(`- İlerleme: ${r.n}/${r.needed} (${day(r.firstDay)} → ${day(r.lastDay)}) — kalan ${Math.max(0, r.needed - r.n)} gün/işlem.`);
        L.push(`- Şu ana kadar ortalama: ${f(r.mean)} (yalnızca bilgi; erken karar verilmez — kısa pencerede sonuçlar şans eseri iyi ya da kötü görünür).`);
      }
    } else {
      L.push(`- ${r.n} gün/işlem (${day(r.firstDay)} → ${day(r.lastDay)}), ortalama ${f(r.mean)}` + (r.holdout ? `, aralık [${f(r.holdout.ciLow)}, ${f(r.holdout.ciHigh)}]` : ''));
      for (const c of r.checks ?? []) L.push(`  - ${c.passed ? '✅' : '❌'} ${c.detail}`);
      if (r.status === 'geçti') L.push('- **Canlıya almadan önce** küçük parayla ve sıkı kayıp limitiyle ayrı bir karar gerekir; bu rapor yalnız istatistiksel geçiştir.');
    }
    L.push('');
  }
  return L.join('\n');
}
