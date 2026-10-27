import { describe, it, expect } from 'vitest';
import { makeBitgetPublic } from '../../src/infrastructure/bitget-public.js';

const ok = (data) => ({ ok: true, status: 200, json: async () => ({ code: '00000', data }) });
const bad = (code, msg) => ({ ok: false, status: 400, json: async () => ({ code, msg }) });

// Gerçek API semantiğini taklit eden sahte sunucu (sabit veri döndüren mock sayfalama
// hatalarını yakalamaz). history-fund-rate: en yeni → en eski, pageNo'ya göre 100'lük dilimler.
function fundingServer(allTs, { ignorePageNo = false } = {}) {
  const desc = [...allTs].sort((a, b) => b - a);
  const calls = [];
  const fetchFn = async (url) => {
    const u = new URL(url);
    calls.push(u.searchParams.get('pageNo'));
    const page = ignorePageNo ? 1 : Number(u.searchParams.get('pageNo'));
    const size = Number(u.searchParams.get('pageSize'));
    const slice = desc.slice((page - 1) * size, page * size);
    return ok(slice.map((ts) => ({ symbol: 'XUSDT', fundingRate: '0.0001', fundingTime: String(ts) })));
  };
  return { fetchFn, calls };
}

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 1);

describe('fetchFundingSince', () => {
  it('1s aralıklı coin: 14 günlük pencere için gerekli sayfaları çeker, sinceMs ve öncesini almaz', async () => {
    const all = Array.from({ length: 900 }, (_, i) => T0 + i * H);
    const since = all[900 - 336 - 1]; // son 336 ödeme isteniyor
    const { fetchFn, calls } = fundingServer(all);
    const rows = await makeBitgetPublic({ fetchFn, pageDelayMs: 0 }).fetchFundingSince('XUSDT', since);
    expect(rows).toHaveLength(336);
    expect(rows[0].timestamp).toBe(since + H);
    expect(rows.at(-1).timestamp).toBe(all.at(-1));
    expect(calls).toEqual(['1', '2', '3', '4']); // 4. sayfada en eski kayıt since'i geçti → dur
  });

  it('API pageNo\'yu yok sayıp hep aynı sayfayı dönerse sonsuz döngüye girmez', async () => {
    const all = Array.from({ length: 500 }, (_, i) => T0 + i * H);
    const { fetchFn, calls } = fundingServer(all, { ignorePageNo: true });
    const rows = await makeBitgetPublic({ fetchFn, pageDelayMs: 0 }).fetchFundingSince('XUSDT', 0);
    expect(rows).toHaveLength(100);
    expect(calls.length).toBe(2);
  });
});

describe('fetchAnnouncements', () => {
  it('limit 10\'u aşmaz, genel + kategori akışlarını annId ile birleştirir', async () => {
    const seenLimits = [];
    const fetchFn = async (url) => {
      const u = new URL(url);
      const limit = Number(u.searchParams.get('limit'));
      seenLimits.push(limit);
      if (limit > 10) return bad('40017', `Parameter verification failed limit=${limit}`);
      const type = u.searchParams.get('annType') ?? 'genel';
      return ok([{ annId: 'ortak', annTitle: 'x' }, { annId: `id-${type}`, annTitle: type }]);
    };
    const anns = await makeBitgetPublic({ fetchFn, retries: 0 }).fetchAnnouncements();
    expect(Math.max(...seenLimits)).toBeLessThanOrEqual(10);
    expect(anns.map((a) => a.annId).sort()).toEqual(
      ['id-coin_listings', 'id-genel', 'id-maintenance_system_updates', 'id-product_updates', 'ortak'],
    );
  });
});
