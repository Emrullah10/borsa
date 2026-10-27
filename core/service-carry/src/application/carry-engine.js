import { CARRY_RULES } from '../domain/carry-config.js';
import { DAY_MS, bucketFundingByCarryDay, trailingApr } from '../domain/funding-buckets.js';
import { selectCarryBook } from '../domain/selector.js';
import { buildCarryUniverse } from '../domain/eligibility.js';
import { planOpen, planClose, fundingPayment, positionPnl, slotNotional } from '../domain/paper-book.js';
import {
  formatOpenMessage, formatCloseMessage, formatRiskMessage, formatDailyReport,
} from '../domain/carry-format.js';

const HOUR_MS = 3_600_000;
// Karar 00:00 UTC ödemesinden sonra, 08:00 ödemesinden ÖNCE verilmeli — backtest'in kazanç
// penceresiyle (taşıma günü) aynı olsun diye. Servis bu pencerede ayakta değilse o gün atlanır.
const DECISION_WINDOW_MS = 7.9 * HOUR_MS;
const BLOCK_LOOKBACK_MS = 30 * DAY_MS;
const MAX_TICKER_AGE_MS = 5 * 60_000;
const OPPORTUNITY_ROWS = 20;

export function makeCarryEngine({
  bitget, repo, fundingStore, sentinel, notify, log, mode = 'paper', capitalUsd,
  rules = CARRY_RULES, now = () => Date.now(), symbolDelayMs = 120,
}) {
  const paper = mode === 'paper';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function loadMarket() {
    const [contracts, perpTickers, spotTickers, currentFunding] = await Promise.all([
      bitget.fetchContracts(), bitget.fetchPerpTickers(), bitget.fetchSpotTickers(), bitget.fetchCurrentFunding(),
    ]);
    const tickerTs = perpTickers.get('BTCUSDT')?.ts ?? 0;
    if (now() - tickerTs > MAX_TICKER_AGE_MS) throw new Error(`Bitget ticker verisi bayat (${Math.round((now() - tickerTs) / 1000)} sn)`);
    return { contracts, perpTickers, spotTickers, currentFunding };
  }

  // Açık pozisyonların gerçekleşen funding ödemelerini deftere yazar (idempotent).
  async function settleFunding(perpTickers) {
    const open = await repo.getOpenPositions(mode);
    if (!open.length) return 0;
    const tickers = perpTickers ?? await bitget.fetchPerpTickers();
    let total = 0;
    for (const p of open) {
      const since = Math.max(p.openedAt, p.lastFundingTs ?? p.openedAt);
      const rows = await bitget.fetchFundingSince(p.symbol, since);
      await fundingStore.upsertFunding('bitget', p.symbol, rows);
      const markPrice = tickers.get(p.symbol)?.mark ?? p.entryPerp;
      const entries = rows.filter((r) => r.timestamp > p.openedAt).map((r) => ({
        ts: r.timestamp, rate: r.rate, markPrice, amountUsd: fundingPayment({ qty: p.qty, rate: r.rate, markPrice }),
      }));
      await repo.addFunding(p.id, entries);
      total += entries.reduce((a, e) => a + e.amountUsd, 0);
      await sleep(symbolDelayMs);
    }
    return total;
  }

  async function refreshFundingHistory(symbols) {
    const floor = now() - (rules.lookbackDays + 5) * DAY_MS;
    for (const symbol of symbols) {
      try {
        const cov = await fundingStore.getCoverage('bitget', symbol);
        const rows = await bitget.fetchFundingSince(symbol, Math.max(cov.maxTs ?? 0, floor));
        await fundingStore.upsertFunding('bitget', symbol, rows);
      } catch (err) {
        log.warn(`[carry] ${symbol} funding geçmişi alınamadı: ${err.message}`);
      }
      await sleep(symbolDelayMs);
    }
  }

  // Taşıma günü `day` için adaylar. fresh = günün 00:00 ödemesi DB'de var mı.
  async function computeCandidates(universe, day) {
    const candidates = [];
    const fresh = new Map();
    for (const symbol of universe.keys()) {
      const series = await fundingStore.getFunding('bitget', symbol, { fromTs: day - (rules.lookbackDays + 1) * DAY_MS });
      fresh.set(symbol, (series.at(-1)?.timestamp ?? 0) >= day - 60_000);
      const apr = trailingApr(bucketFundingByCarryDay(series), day, rules.lookbackDays);
      if (apr !== null) candidates.push({ symbol, apr });
    }
    return { candidates, fresh };
  }

  async function realizedEquity() {
    const all = await repo.getPositions(mode, { limit: 10_000 });
    return all.filter((p) => p.status === 'closed')
      .reduce((eq, p) => eq + positionPnl(p, { fundingUsd: p.fundingUsd }).netUsd, capitalUsd);
  }

  async function closeOne(p, { spotTickers, perpTickers, reason }) {
    const spot = spotTickers.get(p.symbol);
    const perp = perpTickers.get(p.symbol);
    // Delist/askı sonrası bir bacağın fiyatı yoksa son bilinen marka düş — ama bunu yüksek sesle söyle.
    const spotBid = spot?.bid || perp?.mark || p.entrySpot;
    const perpAsk = perp?.ask || perp?.mark || p.entryPerp;
    if (!spot?.bid || !perp?.ask) log.warn(`[carry] ${p.symbol} kapanışında eksik fiyat (spot=${spot?.bid} perp=${perp?.ask}) — yedek fiyat kullanıldı`);
    const closed = planClose(p, { spotBid, perpAsk, at: now(), reason });
    await repo.closePosition(closed);
    const pnl = positionPnl(closed, { fundingUsd: p.fundingUsd });
    await notify(formatCloseMessage(closed, pnl, { paper }));
    return { ...closed, pnl };
  }

  async function runDailyDecision({ force = false, dryRun = false } = {}) {
    const t = now();
    const day = Math.floor(t / DAY_MS) * DAY_MS;
    if (!force && t - day > DECISION_WINDOW_MS) return { skipped: 'pencere-dışı' };
    if (!dryRun && (await repo.getState(`last_decision_day:${mode}`)) === String(day)) return { skipped: 'bugün-yapıldı' };

    const { contracts, perpTickers, spotTickers, currentFunding } = await loadMarket();
    const universe = buildCarryUniverse({ contracts, perpTickers, spotTickers, rules });
    const heldBefore = await repo.getOpenPositions(mode);
    await refreshFundingHistory([...new Set([...universe.keys(), ...heldBefore.map((p) => p.symbol)])]);
    if (!dryRun) await settleFunding(perpTickers);
    // 00:00 ödemesi deftere girdikten sonra yeniden oku — kapanış mesajındaki funding eksik kalmasın.
    const held = dryRun ? heldBefore : await repo.getOpenPositions(mode);

    const { candidates, fresh } = await computeCandidates(universe, day);
    // Tutulan coin'in verisi eksikse "evren-dışı" diye yanlışlıkla kapatma: kararı ertele.
    const staleHeld = held.filter((p) => universe.has(p.symbol) && !fresh.get(p.symbol)).map((p) => p.symbol);
    if (staleHeld.length && !dryRun) {
      log.warn(`[carry] 00:00 funding'i henüz yok: ${staleHeld.join(', ')} — karar sonraki tura ertelendi`);
      return { skipped: 'veri-eksik', symbols: staleHeld };
    }
    const usable = candidates.filter((c) => fresh.get(c.symbol));
    const blocked = await repo.getBlockedSymbols(t - BLOCK_LOOKBACK_MS);
    const decision = selectCarryBook({ candidates: usable, held: held.map((p) => p.symbol), blocked, rules });

    const opportunities = [...usable].sort((a, b) => b.apr - a.apr).slice(0, OPPORTUNITY_ROWS).map((c) => ({
      symbol: c.symbol, apr: c.apr,
      currentRate: currentFunding.get(c.symbol)?.rate ?? null,
      intervalHours: currentFunding.get(c.symbol)?.intervalHours ?? null,
      spotVolume: universe.get(c.symbol).spotVolume, perpVolume: universe.get(c.symbol).perpVolume,
      blocked: blocked.has(c.symbol),
    }));
    const result = { day, universeSize: universe.size, candidateCount: usable.length, decision, opportunities, blocked: [...blocked] };
    if (dryRun) return result;

    const closed = [];
    for (const { symbol, reason } of decision.close) {
      closed.push(await closeOne(held.find((p) => p.symbol === symbol), { spotTickers, perpTickers, reason }));
    }
    const notionalUsd = slotNotional(await realizedEquity(), rules.slots);
    const opened = [];
    for (const { symbol, apr } of decision.open) {
      const p = planOpen({
        symbol, notionalUsd, spotAsk: spotTickers.get(symbol).ask, perpBid: perpTickers.get(symbol).bid, at: t, apr,
      });
      const id = await repo.insertPosition(mode, p);
      opened.push({ ...p, id });
      await notify(formatOpenMessage(p, { paper }));
    }

    await repo.saveOpportunities(day, opportunities);
    await repo.setState(`universe:${mode}`, JSON.stringify([...universe.keys()]));
    await repo.setState(`last_decision_day:${mode}`, day);

    const summary = await buildSummary({ perpTickers, spotTickers });
    const fundingYesterday = await repo.fundingBetween(mode, day - DAY_MS, day);
    await repo.upsertDailyEquity(mode, { day, equityUsd: summary.equityUsd, fundingUsd: fundingYesterday, openPositions: summary.open.length });
    await notify(formatDailyReport({
      equityUsd: summary.equityUsd, startEquityUsd: capitalUsd, fundingTodayUsd: fundingYesterday,
      positions: summary.open.map((p) => ({ symbol: p.symbol, pnl: p.pnl, daysOpen: p.daysOpen })),
    }, { paper }));
    log.info(`[carry] karar ${new Date(day).toISOString().slice(0, 10)}: evren ${universe.size}, aday ${usable.length}, kapat ${closed.length}, aç ${opened.length}`);
    return { ...result, opened, closed };
  }

  async function buildSummary({ perpTickers, spotTickers } = {}) {
    const all = await repo.getPositions(mode, { limit: 500 });
    const openRaw = all.filter((p) => p.status === 'open');
    const pt = perpTickers ?? (openRaw.length ? await bitget.fetchPerpTickers() : new Map());
    const st = spotTickers ?? (openRaw.length ? await bitget.fetchSpotTickers() : new Map());
    const t = now();
    const open = openRaw.map((p) => {
      const pnl = positionPnl(p, {
        fundingUsd: p.fundingUsd, spotBid: st.get(p.symbol)?.bid ?? p.entrySpot, perpAsk: pt.get(p.symbol)?.ask ?? p.entryPerp,
      });
      return { ...p, pnl, daysOpen: (t - p.openedAt) / DAY_MS };
    });
    const closed = all.filter((p) => p.status === 'closed').map((p) => ({
      ...p, pnl: positionPnl(p, { fundingUsd: p.fundingUsd }), daysOpen: (p.closedAt - p.openedAt) / DAY_MS,
    }));
    const realizedUsd = closed.reduce((a, p) => a + p.pnl.netUsd, 0);
    const unrealizedUsd = open.reduce((a, p) => a + p.pnl.netUsd, 0);
    const fundingTotalUsd = [...open, ...closed].reduce((a, p) => a + p.pnl.fundingUsd, 0);
    return {
      mode, capitalUsd, equityUsd: capitalUsd + realizedUsd + unrealizedUsd, realizedUsd, unrealizedUsd,
      fundingTotalUsd, open, closed, rules,
    };
  }

  async function watchedSymbols(held) {
    const cached = await repo.getState(`universe:${mode}`);
    let universe = cached ? JSON.parse(cached) : null;
    if (!universe) {
      const { contracts, perpTickers, spotTickers } = await loadMarket();
      universe = [...buildCarryUniverse({ contracts, perpTickers, spotTickers, rules }).keys()];
    }
    return new Set([...held.map((p) => p.symbol), ...universe]);
  }

  // Bitget duyurularını tarar. Evrendeki HER coin izlenir (yalnız eldekiler değil): yarın
  // açılacak bir coin'in delist duyurusu bugün kaçarsa blok listesine hiç girmez.
  async function runSentinel() {
    const anns = await bitget.fetchAnnouncements();
    const seen = await repo.seenAnnouncementIds(anns.map((a) => a.annId));
    const unseen = anns.filter((a) => !seen.has(a.annId)).sort((a, b) => Number(a.cTime) - Number(b.cTime));
    if (!unseen.length) return { assessed: 0 };

    const held = await repo.getOpenPositions(mode);
    const heldSet = new Set(held.map((p) => p.symbol));
    const watched = await watchedSymbols(held);
    let alerts = 0;
    for (const ann of unseen) {
      const a = await sentinel.assess(ann, watched);
      await repo.insertRiskEvent({
        annId: ann.annId, annTitle: ann.annTitle, annUrl: ann.annUrl, annTime: Number(ann.cTime), ...a, createdAt: now(),
      });
      if (a.severity === 'none') continue;
      const touchesHeld = a.symbols.some((s) => heldSet.has(s));
      const recent = now() - Number(ann.cTime) < DAY_MS;
      if (recent && (a.severity !== 'watch' || touchesHeld)) { await notify(formatRiskMessage(a, ann)); alerts++; }
      if (a.severity === 'exit' && touchesHeld) {
        const [perpTickers, spotTickers] = await Promise.all([bitget.fetchPerpTickers(), bitget.fetchSpotTickers()]);
        await settleFunding(perpTickers);
        const current = await repo.getOpenPositions(mode);
        for (const p of current.filter((x) => a.symbols.includes(x.symbol))) {
          await closeOne(p, { spotTickers, perpTickers, reason: 'risk-blok' });
          heldSet.delete(p.symbol);
        }
      }
    }
    return { assessed: unseen.length, alerts };
  }

  return { runDailyDecision, settleFunding, runSentinel, buildSummary };
}
