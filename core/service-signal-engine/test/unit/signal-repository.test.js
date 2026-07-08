import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSignalRepository } from '../../src/infrastructure/persistence/repositories/signal-repository.js';

describe('signal-repository', () => {
  let db;
  let repo;

  beforeEach(() => {
    db = { query: vi.fn() };
    repo = makeSignalRepository({ db });
  });

  it('getRecentSignals doğru SQL ile limit=20 çağırır ve rows döner', async () => {
    const fakeRows = [
      { id: 1, symbol: 'BTCUSDT', direction: 'long', entry_price: '78000', confluence_score: '0.87', created_at: new Date() },
    ];
    db.query.mockResolvedValue({ rows: fakeRows });

    const result = await repo.getRecentSignals(20);

    expect(db.query).toHaveBeenCalledOnce();
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(params).toEqual([20]);
    expect(result).toEqual(fakeRows);
  });

  it('getPendingOutcomes sim_entry_price kolonunu da seçer', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await repo.getPendingOutcomes();
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('sim_entry_price');
  });

  it('setSimEntry doğru SQL ve parametrelerle UPDATE çalıştırır', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await repo.setSimEntry('outcome-1', 1010.5);
    expect(db.query).toHaveBeenCalledOnce();
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('UPDATE signal_outcomes');
    expect(sql).toContain('sim_entry_price');
    expect(params).toEqual([1010.5, 'outcome-1']);
  });

  it('resolveOutcome genişletilmiş alanları (simPnlR, tieBreak, notes) UPDATE eder', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await repo.resolveOutcome('outcome-1', {
      status: 'sl_hit',
      exitPrice: 900,
      pnlR: -1,
      simPnlR: -1.2,
      tieBreak: true,
      notes: 'tie-break: SL-first',
    });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('sim_pnl_r');
    expect(sql).toContain('tie_break');
    expect(params).toEqual(['sl_hit', 900, -1, -1.2, true, 'tie-break: SL-first', 'outcome-1']);
  });

  it('resolveOutcome opsiyonel alanlar verilmezse null/false varsayılan kullanır', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await repo.resolveOutcome('outcome-1', { status: 'tp_hit', exitPrice: 1150, pnlR: 1.5 });
    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual(['tp_hit', 1150, 1.5, null, false, null, 'outcome-1']);
  });
});
