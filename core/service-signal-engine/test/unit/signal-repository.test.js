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
    expect(sql).toContain('ORDER BY');
    expect(params).toEqual([20]);
    expect(result).toEqual(fakeRows);
  });

  // Panelden gerçek dolum girebilmek için outcome_id şart — POST /outcomes/:id/real-fill
  // outcome_id bekliyor ama sinyal listesi sadece signals.id döndürüyordu, form
  // isteği gönderemezdi. Kaydedilen gerçek dolum da geri gösterilmeli.
  it('getRecentSignals outcome_id ve gerçek dolum alanlarını da döner', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await repo.getRecentSignals(20);
    const [sql] = db.query.mock.calls[0];

    expect(sql).toContain('signal_outcomes');
    expect(sql).toContain('outcome_id');
    expect(sql).toContain('real_entry_price');
    expect(sql).toContain('sim_entry_price'); // model vs gerçek karşılaştırması için
  });

  it('getPendingOutcomes sim_entry_price kolonunu da seçer', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await repo.getPendingOutcomes();
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('sim_entry_price');
  });

  it('recordRealFill gerçek giriş/çıkış fiyatlarını signal_outcomes.real_* kolonlarına yazar (Faz 3 execution doğrulama)', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await repo.recordRealFill('outcome-1', {
      realEntryPrice: 1010.5,
      realExitPrice: 1150.2,
      realEntryAt: '2026-08-20T10:00:00.000Z',
      notes: 'manuel giriş, 90sn gecikme',
    });
    expect(db.query).toHaveBeenCalledOnce();
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('real_entry_price');
    expect(sql).toContain('real_exit_price');
    expect(sql).toContain('real_entry_at');
    expect(params).toEqual([1010.5, 1150.2, '2026-08-20T10:00:00.000Z', 'manuel giriş, 90sn gecikme', 'outcome-1']);
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

  it('saveSignal regime ve higherTfTrend parametrelerini INSERT eder', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'sig-1', created_at: new Date() }] });
    await repo.saveSignal({
      symbol: 'BTCUSDT', direction: 'long', triggerTimeframe: '1m',
      entryPrice: 100, stopPrice: 90, targetPrice: 120,
      rrRatio: 1.5, confluenceScore: 0.8, indicatorsSnapshot: {},
      regime: 'bull', higherTfTrend: 'long',
    });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('regime');
    expect(sql).toContain('higher_tf_trend');
    expect(params).toContain('bull');
    expect(params).toContain('long');
  });

  it('saveSignal regime/higherTfTrend verilmezse null geçer', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'sig-1', created_at: new Date() }] });
    await repo.saveSignal({
      symbol: 'BTCUSDT', direction: 'long', triggerTimeframe: '1m',
      entryPrice: 100, stopPrice: 90, targetPrice: 120,
      rrRatio: 1.5, confluenceScore: 0.8, indicatorsSnapshot: {},
    });
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain(null);
  });

  it('getSignalStats days parametresini interval olarak geçirir', async () => {
    db.query.mockResolvedValue({ rows: [{}] });
    await repo.getSignalStats(14);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('make_interval');
    expect(params).toEqual([14]);
  });

  it('getSignalStats varsayılan days=7 kullanır', async () => {
    db.query.mockResolvedValue({ rows: [{}] });
    await repo.getSignalStats();
    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([7]);
  });

  it('getSignalStats tie_breaks sayısını da döner', async () => {
    db.query.mockResolvedValue({ rows: [{}] });
    await repo.getSignalStats();
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('tie_break');
  });

  it('getSignalStats resolved_n döner — win_rate paydası (total ile karıştırılmasın)', async () => {
    db.query.mockResolvedValue({ rows: [{}] });
    await repo.getSignalStats();
    const [sql] = db.query.mock.calls[0];
    expect(sql).toMatch(/AS resolved_n/);
  });

  it('getSignalStats win_rate_incl_timeout döner — timeout r>0 kazanç sayılır', async () => {
    db.query.mockResolvedValue({ rows: [{}] });
    await repo.getSignalStats();
    const [sql] = db.query.mock.calls[0];
    expect(sql).toMatch(/AS win_rate_incl_timeout/);
  });

  it('getSignalStats profit_factor_after_fee döner — fee düşülmüş pnl üzerinden', async () => {
    db.query.mockResolvedValue({ rows: [{}] });
    await repo.getSignalStats();
    const [sql] = db.query.mock.calls[0];
    expect(sql).toMatch(/AS profit_factor_after_fee/);
  });

  it('getTopSymbolStats days parametresini kabul eder', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await repo.getTopSymbolStats(30);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('make_interval');
    expect(params).toEqual([30]);
  });

  it('getStatsBreakdown geçerli by="regime" için whitelist SQL üretir', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await repo.getStatsBreakdown({ by: 'regime', days: 7 });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('regime');
    expect(params).toEqual([7]);
  });

  it('getStatsBreakdown geçerli by="tf" için trigger_timeframe kolonunu kullanır', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await repo.getStatsBreakdown({ by: 'tf', days: 7 });
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('trigger_timeframe');
  });

  it('getStatsBreakdown geçerli by="hour" için EXTRACT(HOUR) kullanır', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await repo.getStatsBreakdown({ by: 'hour', days: 7 });
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('EXTRACT(HOUR');
  });

  it('getStatsBreakdown geçerli by="direction" için direction kolonunu kullanır', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await repo.getStatsBreakdown({ by: 'direction', days: 7 });
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('s.direction');
  });

  it('getStatsBreakdown geçersiz by değeri için hata fırlatır (asla ham input SQL\'e girmez)', async () => {
    await expect(repo.getStatsBreakdown({ by: "regime'; DROP TABLE signals; --", days: 7 }))
      .rejects.toThrow(/invalid/i);
    expect(db.query).not.toHaveBeenCalled();
  });
});
