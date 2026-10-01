// Lab (2026-09-30) — sade Türkçe rapor (saf string üretimi).
const f = (x, d = 4) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));

export function buildReport({ generatedAt, coverage, holdoutOpened, families }) {
  const passed = families.filter((x) => x.verdict?.passed);
  const pending = families.filter((x) => x.verdict?.pending);
  const L = [];
  L.push('# Strateji Laboratuvarı Raporu');
  L.push('');
  L.push(`Oluşturulma: ${generatedAt}`);
  L.push(`Holdout: ${holdoutOpened ? 'AÇILDI (aday başına tek kez)' : 'AÇILMADI'}`);
  L.push('');
  L.push('## Özet');
  if (passed.length === 0 && pending.length > 0) {
    L.push(`**Henüz karar yok:** ${pending.map((x) => x.title).join(', ')} doğrulama kapısını geçti ve holdout'u bekliyor (holdout'u açmak aday başına TEK seferlik bir karardır). Doğrulamada elenenler aşağıda.`);
  } else if (passed.length === 0) {
    L.push('**Hiçbir aday geçmedi.** Bu geçerli ve değerli bir sonuçtur: bu fikirlerde, hiç görülmemiş veride, maliyetler düşüldükten sonra kanıtlanabilir bir avantaj yok. Sermaye korunur.');
  } else {
    L.push(`**${passed.length} aday GEÇTİ:** ${passed.map((x) => x.title).join(', ')}. (Canlıya almadan önce kâğıt üstünde ileri-test şart.)`);
  }
  L.push('');
  L.push('## Kapsam');
  L.push(`- Kripto sembol sayısı: ${coverage.cryptoSymbols}`);
  L.push(`- Günlük veri aralığı: ${coverage.dailyRange}`);
  L.push(`- Binance funding kapsamı: %${coverage.fundingBinancePct}`);
  if (coverage.skippedNote) L.push(`- ${coverage.skippedNote}`);
  L.push('');
  L.push('## Adaylar');
  for (const fam of families) {
    const v = fam.verdict ?? {};
    const tag = v.pending ? 'HOLDOUT BEKLİYOR (doğrulamayı geçti)' : v.skipped ? 'KALDI (holdout açılmadı)' : v.passed ? 'GEÇTİ' : 'KALDI';
    L.push(`### ${fam.title} — ${tag}`);
    L.push(`- Seçilen ayar (train'de): ${fam.config}`);
    L.push(`- Train: ortalama ${f(fam.train?.mean)} (n=${fam.train?.n ?? 0})`);
    L.push(`- Doğrulama: ortalama ${f(fam.validation?.mean)}, en iyi %2.5 çıkarılınca ${f(fam.validation?.trimmedMean)} (n=${fam.validation?.n ?? 0})`);
    if (v.skipped) {
      L.push(`- ${v.reason}`);
    } else if (fam.holdout) {
      L.push(`- Holdout: ortalama ${f(fam.holdout.mean)}, aralık [${f(fam.holdout.ciLow)}, ${f(fam.holdout.ciHigh)}] (n=${fam.holdout.n})`);
      for (const c of v.checks ?? []) L.push(`  - ${c.passed ? '✅' : '❌'} ${c.detail}`);
    }
    L.push('');
  }
  L.push('## Sınırlamalar (sonuçları okurken bilinmeli)');
  L.push('- **Hayatta kalma yanlılığı:** delist edilmiş coinler evrende yok; özellikle long taraf iyimser görünebilir.');
  L.push('- **Vekil funding:** Bitget geçmişi yalnız ~90 gün; öncesi için Binance funding kullanıldı (aynı-an korelasyonu ~0.58, tam ikame değil).');
  L.push('- Likidite yaklaşık (close × hacim); kayma katmanı sabit (ilk 20 coin 0.03%, diğerleri 0.08%).');
  L.push('- RWA (hisse/ETF/emtia) kontratları evrenden çıkarıldı.');
  L.push('- Çoklu deneme: 4 aile için Bonferroni düzeltmesi uygulandı.');
  return L.join('\n');
}
