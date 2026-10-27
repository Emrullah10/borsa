import { CARRY_COST } from './carry-config.js';

// Kâğıt üstü delta-nötr defter. Her pozisyon = qty adet spot LONG + qty adet perp SHORT.
// Dolum fiyatları borsanın GERÇEK en iyi alış/satışından gelir (spread dahil), üstüne komisyon.
// Fiyat hareketi iki bacakta birbirini götürür; geriye funding + baz değişimi - maliyet kalır.

// Sermayenin %10'u tampon: perp bacağının teminatı/marj dalgalanması için boşta durur.
export const UTILIZATION = 0.9;

export function slotNotional(equityUsd, slots) {
  return (equityUsd * UTILIZATION) / slots;
}

// Açılış: spot'u ask'tan al, perp'i bid'den sat.
export function planOpen({ symbol, notionalUsd, spotAsk, perpBid, at, apr }) {
  const qty = notionalUsd / spotAsk;
  const entryFees = qty * spotAsk * CARRY_COST.spotFee + qty * perpBid * CARRY_COST.perpTakerFee;
  return {
    symbol, qty, notionalUsd, openedAt: at, entrySpot: spotAsk, entryPerp: perpBid,
    entryFees, entryApr: apr, status: 'open',
  };
}

// Kapanış: spot'u bid'e sat, perp short'u ask'tan geri al.
export function planClose(position, { spotBid, perpAsk, at, reason }) {
  const exitFees = position.qty * spotBid * CARRY_COST.spotFee + position.qty * perpAsk * CARRY_COST.perpTakerFee;
  return { ...position, status: 'closed', closedAt: at, exitSpot: spotBid, exitPerp: perpAsk, exitFees, closeReason: reason };
}

// Tek funding ödemesinin USD karşılığı. Pozitif oranda long öder, short alır → short için +.
export function fundingPayment({ qty, rate, markPrice }) {
  return qty * markPrice * rate;
}

// Pozisyonun net sonucu. Açıksa "şimdi kapatsam" fiyatlarıyla (spotBid/perpAsk) + tahmini çıkış
// komisyonu; kapalıysa gerçekleşen çıkış fiyatlarıyla.
export function positionPnl(position, { fundingUsd, spotBid, perpAsk }) {
  const closed = position.status === 'closed';
  const xs = closed ? position.exitSpot : spotBid;
  const xp = closed ? position.exitPerp : perpAsk;
  const exitFees = closed
    ? position.exitFees
    : position.qty * xs * CARRY_COST.spotFee + position.qty * xp * CARRY_COST.perpTakerFee;
  const basisUsd = position.qty * (xs - position.entrySpot) - position.qty * (xp - position.entryPerp);
  const feesUsd = position.entryFees + exitFees;
  return { fundingUsd, basisUsd, feesUsd, netUsd: fundingUsd + basisUsd - feesUsd };
}
