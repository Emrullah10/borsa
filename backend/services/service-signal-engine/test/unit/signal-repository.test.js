import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@borsa-bot/datasource', () => ({
  default: {
    postgres: {
      query: vi.fn(),
    },
  },
}));

import datasources from '@borsa-bot/datasource';
import { getRecentSignals } from '../../src/signal-repository.js';

describe('getRecentSignals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('doğru SQL ile limit=20 çağırır ve rows döner', async () => {
    const fakeRows = [
      { id: 1, symbol: 'BTCUSDT', direction: 'long', entry_price: '78000', confluence_score: '0.87', created_at: new Date() },
    ];
    datasources.postgres.query.mockResolvedValue({ rows: fakeRows });

    const result = await getRecentSignals(20);

    expect(datasources.postgres.query).toHaveBeenCalledOnce();
    const [sql, params] = datasources.postgres.query.mock.calls[0];
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(params).toEqual([20]);
    expect(result).toEqual(fakeRows);
  });
});
