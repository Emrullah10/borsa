import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeProcessOutcomeCandle } from '../../src/application/use-cases/make-process-outcome-candle.js';

const TIMEOUT_MS = 4 * 60 * 60 * 1000;
const FEES = { takerFee: 0.0006, slippagePct: 0.0003 };

describe('make-process-outcome-candle', () => {
  let signalRepo;
  let publish;
  let log;
  let useCase;

  const makePendingOutcome = () => ({
    outcome_id: 'o1',
    signal_id: 's1',
    symbol: 'BTCUSDT',
    direction: 'long',
    entry_price: '1000',
    stop_price: '900',
    target_price: '1150',
    sim_entry_price: null,
    signal_created_at: new Date().toISOString(),
  });
  let pendingOutcome;

  beforeEach(() => {
    pendingOutcome = makePendingOutcome();
    signalRepo = {
      getPendingOutcomes: vi.fn().mockResolvedValue([pendingOutcome]),
      setSimEntry: vi.fn().mockResolvedValue(undefined),
      resolveOutcome: vi.fn().mockResolvedValue(undefined),
    };
    publish = vi.fn().mockResolvedValue(undefined);
    log = { info: vi.fn(), debug: vi.fn(), error: vi.fn() };
    useCase = makeProcessOutcomeCandle({ signalRepo, publish, log, timeoutMs: TIMEOUT_MS, fees: FEES });
  });

  it('refreshPending: pending outcomeları yükler', async () => {
    await useCase.refreshPending();
    expect(signalRepo.getPendingOutcomes).toHaveBeenCalledOnce();
  });

  it('handleCandleMessage: hedefe ulaşınca resolveOutcome ve publish çağırır', async () => {
    await useCase.refreshPending();
    await useCase.handleCandleMessage({
      type: 'candle',
      symbol: 'BTCUSDT',
      data: { open: 1100, high: 1150, low: 1090, close: 1140 },
    });

    expect(signalRepo.resolveOutcome).toHaveBeenCalledWith('o1', expect.objectContaining({ status: 'tp_hit' }));
    expect(publish).toHaveBeenCalledWith('signals.resolved', expect.stringContaining('"status":"tp_hit"'));
  });

  it('handleCandleMessage: aynı outcome iki kez resolve edilmez', async () => {
    await useCase.refreshPending();
    const msg = {
      type: 'candle',
      symbol: 'BTCUSDT',
      data: { open: 1100, high: 1150, low: 1090, close: 1140 },
    };
    await useCase.handleCandleMessage(msg);
    await useCase.handleCandleMessage(msg);

    expect(signalRepo.resolveOutcome).toHaveBeenCalledTimes(1);
  });

  it('handleCandleMessage: candle tipi değilse hiçbir şey yapmaz', async () => {
    await useCase.refreshPending();
    await useCase.handleCandleMessage({ type: 'funding', symbol: 'BTCUSDT', data: {} });
    expect(signalRepo.resolveOutcome).not.toHaveBeenCalled();
  });

  it('handleCandleMessage: sim entry henüz yoksa ilk mumun open + slippage ile yakalar', async () => {
    await useCase.refreshPending();
    // Fiyat aralıkta, resolve olmayan bir mum — sadece sim entry yakalanmalı
    await useCase.handleCandleMessage({
      type: 'candle',
      symbol: 'BTCUSDT',
      data: { open: 1010, high: 1020, low: 1005, close: 1015 },
    });

    // LONG: slippage entry fiyatını yukarı iter (daha kötü fiyattan giriyorsun)
    const expectedSimEntry = 1010 * (1 + FEES.slippagePct);
    expect(signalRepo.setSimEntry).toHaveBeenCalledWith('o1', expectedSimEntry);
    expect(signalRepo.resolveOutcome).not.toHaveBeenCalled();
  });

  it('handleCandleMessage: SHORT sinyalde slippage entry fiyatını aşağı iter', async () => {
    const shortOutcome = { ...pendingOutcome, outcome_id: 'o2', direction: 'short', sim_entry_price: null };
    signalRepo.getPendingOutcomes.mockResolvedValue([shortOutcome]);
    await useCase.refreshPending();
    await useCase.handleCandleMessage({
      type: 'candle',
      symbol: 'BTCUSDT',
      data: { open: 1010, high: 1020, low: 1000, close: 1005 },
    });
    const expectedSimEntry = 1010 * (1 - FEES.slippagePct);
    expect(signalRepo.setSimEntry).toHaveBeenCalledWith('o2', expectedSimEntry);
  });

  it('handleCandleMessage: sim entry zaten varsa tekrar setSimEntry çağrılmaz', async () => {
    const filledOutcome = { ...pendingOutcome, sim_entry_price: '1005' };
    signalRepo.getPendingOutcomes.mockResolvedValue([filledOutcome]);
    await useCase.refreshPending();
    await useCase.handleCandleMessage({
      type: 'candle',
      symbol: 'BTCUSDT',
      data: { open: 1010, high: 1020, low: 1005, close: 1015 },
    });
    expect(signalRepo.setSimEntry).not.toHaveBeenCalled();
  });

  it('handleCandleMessage: aynı mumda hem sim entry yakalanır hem resolve olursa simPnlR gönderilir', async () => {
    await useCase.refreshPending();
    await useCase.handleCandleMessage({
      type: 'candle',
      symbol: 'BTCUSDT',
      data: { open: 1010, high: 1150, low: 1005, close: 1140 },
    });
    expect(signalRepo.setSimEntry).toHaveBeenCalledOnce();
    expect(signalRepo.resolveOutcome).toHaveBeenCalledWith('o1', expect.objectContaining({
      status: 'tp_hit',
      simPnlR: expect.any(Number),
    }));
  });

  it('handleCandleMessage: tie-break durumunda notes ve tieBreak resolveOutcome\'a geçer', async () => {
    await useCase.refreshPending();
    await useCase.handleCandleMessage({
      type: 'candle',
      // low stop'u da hedefi de geçiyor → SL öncelikli tie-break
      symbol: 'BTCUSDT',
      data: { open: 1010, high: 1150, low: 800, close: 950 },
    });
    expect(signalRepo.resolveOutcome).toHaveBeenCalledWith('o1', expect.objectContaining({
      status: 'sl_hit',
      tieBreak: true,
      notes: expect.stringContaining('tie-break'),
    }));
  });
});
