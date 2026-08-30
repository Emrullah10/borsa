// Faz 1.5 (kalıcı mum deposu): "önce DB, yoksa REST" katmanı. sweep.js/main.js'in
// her çalıştırmada Bitget REST'ten sıfırdan çekmesi hem yavaş (27 combo × 5 sembol
// × onbinlerce istek), hem tekrarlanabilir değil, hem sunucuda 88°C termal
// kapanmaya yol açmıştı. Bu katman candle-store-repository.js'teki kapsamı
// (getCoverage) kontrol eder; istenen [now-days, now] aralığını yeterince
// kapsıyorsa DB'den okur, aksi halde REST'e düşer ve sonucu DB'ye yazar (bir
// sonraki çalıştırma hızlanır). DB'ye erişilemezse (repo yok ya da hata) sessizce
// REST'e düşer — backtest asla DB'nin varlığına bağımlı olmamalı.

// DB kapsamının "yeterli" sayılması için tolerans: mum aralığının birkaç katı —
// tam sınırda ("bir mum eksik") gereksiz REST çağrısı yapmamak için.
const COVERAGE_TOLERANCE_MS = 6 * 60 * 60 * 1000; // 6 saat

function isCoverageSufficient(coverage, rangeStartMs, rangeEndMs) {
  if (!coverage || coverage.minTs == null || coverage.maxTs == null) return false;
  return coverage.minTs <= rangeStartMs + COVERAGE_TOLERANCE_MS
    && coverage.maxTs >= rangeEndMs - COVERAGE_TOLERANCE_MS;
}

/**
 * @param {object} p
 * @param {object|null} p.repo - candle-store-repository (yoksa doğrudan REST)
 * @param {(symbol:string, tf:string, days:number) => Promise<Array>} p.fetchFromRest - fetcher.js'in fetchCandles'ı
 * @param {string} p.symbol
 * @param {string} p.tf
 * @param {number} p.days
 * @param {number} [p.now=Date.now()]
 */
export async function fetchCandlesCached({ repo, fetchFromRest, symbol, tf, days, now = Date.now() }) {
  if (repo) {
    try {
      const rangeStartMs = now - days * 24 * 60 * 60 * 1000;
      const coverage = await repo.getCoverage(symbol, tf);
      if (isCoverageSufficient(coverage, rangeStartMs, now)) {
        return await repo.getCandles(symbol, tf, { fromTs: rangeStartMs, toTs: now });
      }
    } catch (err) {
      // DB erişilemez/hatalı — sessizce REST'e düş, backtest DB'siz de çalışabilmeli.
    }
  }

  const candles = await fetchFromRest(symbol, tf, days);
  if (repo && candles.length) {
    try {
      await repo.upsertCandles(symbol, tf, candles);
    } catch (err) {
      // Yazma başarısız olsa da elimizdeki veriyi döndürmeye devam et.
    }
  }
  return candles;
}
