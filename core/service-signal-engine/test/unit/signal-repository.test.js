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
});
