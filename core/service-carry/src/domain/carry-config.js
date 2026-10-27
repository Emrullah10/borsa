// Funding Carry (2026-10-27) — DONDURULMUŞ kurallar.
// Strateji: aynı coinden spot AL + perp SHORT (eşit adet) → fiyat yönü sıfırlanır, pozitif
// funding'de short tarafı ödeme alır. Backtest (npm run carry:backtest) ve canlı kâğıt servis
// (service-carry) bu sabitleri ve aynı saf fonksiyonları kullanır. Bir değeri değiştirmek =
// yeni hipotez = ileri test sayacı sıfırlanır (bkz. spec 2026-10-27-funding-carry-design.md).
export const CARRY_RULES = Object.freeze({
  lookbackDays: 14,        // L: son 14 tam taşıma gününün ortalama funding'i
  slots: 5,                // N: aynı anda en fazla 5 coin, her biri sermayenin 1/5'i
  entryApr: 0.15,          // yıllık %15 ve üstü → aç
  exitApr: 0.05,           // yıllık %5 altı → kapat
  rankBufferMult: 2,       // eligible sıralamada 2N'in dışına düşen → kapat (yer aç)
  minSpotVolumeUsdt: 1_000_000,
  minPerpVolumeUsdt: 5_000_000,
});

// Bitget VIP0 (2026-08 destek sayfası): spot %0.1 maker/taker, USDT-M %0.02 maker / %0.06 taker.
// Taraf = iki bacak birlikte (spot + perp). Kayma bacak başına, temkinli.
export const CARRY_COST = Object.freeze({
  spotFee: 0.001,
  perpTakerFee: 0.0006,
  slippageLiquid: 0.0003,
  slippageThin: 0.0008,
  liquidSpotVolumeUsdt: 50_000_000,
});

// Bir tarafın (açılış ya da kapanış) notional'a oranla modellenmiş maliyeti.
export function modeledSideCost(spotVolumeUsdt, costMultiplier = 1) {
  const slip = spotVolumeUsdt >= CARRY_COST.liquidSpotVolumeUsdt
    ? CARRY_COST.slippageLiquid : CARRY_COST.slippageThin;
  return (CARRY_COST.spotFee + CARRY_COST.perpTakerFee + 2 * slip) * costMultiplier;
}
