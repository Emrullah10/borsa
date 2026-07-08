import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeProcessOutcomeCandle } from '../../src/application/use-cases/make-process-outcome-candle.js';

const TIMEOUT_MS = 4 * 60 * 60 * 1000;

describe('make-process-outcome-candle', () => {
  let signalRepo;
  let publish;
  let log;
  let useCase;

  const pendingOutcome = {
    outcome_id: 'o1',
    signal_id: 's1',
    symbol: 'BTCUSDT',
    direction: 'long',
    entry_price: '1000',
    stop_price: '900',
    target_price: '1150',
    signal_created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    signalRepo = {
      getPendingOutcomes: vi.fn().mockResolvedValue([pendingOutcome]),
      resolveOutcome: vi.fn().mockResolvedValue(undefined),
    };
    publish = vi.fn().mockResolvedValue(undefined);
    log = { info: vi.fn(), debug: vi.fn(), error: vi.fn() };
    useCase = makeProcessOutcomeCandle({ signalRepo, publish, log, timeoutMs: TIMEOUT_MS });
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
});
