import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Faz 2.1 (B7 düzeltmesi, bug-166 deseniyle aynı kök neden): bu dosya için hiç
// birim test yoktu — bu yüzden yanlış metot adı (getFuturesAccountLongShortRatio,
// bitget-api'de hiç yoktu) aylarca fark edilmedi; boş `catch{}` hatayı sessizce
// yutuyordu. Bu test LSR poller'ın DOĞRU metodu (getFuturesActiveLongShortAccountData)
// çağırdığını ve dönen alanları (longAccountRatio/shortAccountRatio) doğru
// publishLongShortRatio'ya eşlediğini kanıtlar.

const getFuturesActiveLongShortAccountDataMock = vi.fn();
const getFuturesAllTickersMock = vi.fn();

vi.mock('bitget-api', () => ({
  RestClientV2: vi.fn().mockImplementation(() => ({
    getFuturesActiveLongShortAccountData: getFuturesActiveLongShortAccountDataMock,
    getFuturesAllTickers: getFuturesAllTickersMock,
  })),
}));

vi.mock('@borsa-bot/helper', () => ({
  default: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } },
}));

// Faz 2.3 (B9-2 düzeltmesi): minimum hacim filtresi olmadan resolveSymbols
// sadece hacme göre sıralıyordu — aşırı düşük likiditeli semboller de TOP:N'e
// girebiliyordu. Bu testler MIN_24H_VOLUME_USDT filtresini doğrular.
describe('resolveSymbols', () => {
  let resolveSymbols;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(async () => {
    getFuturesAllTickersMock.mockReset();
    if (!resolveSymbols) {
      ({ resolveSymbols } = await import('../../src/bitget-ws.js'));
    }
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('TOP:N ile hacme göre sıralar VE minimum hacim altındakileri eler', async () => {
    process.env.MARKET_DATA_SYMBOLS = 'TOP:10';
    process.env.MIN_24H_VOLUME_USDT = '1000000';
    getFuturesAllTickersMock.mockResolvedValue({
      data: [
        { symbol: 'BIGUSDT', usdtVolume: '50000000' },
        { symbol: 'TINYUSDT', usdtVolume: '500' }, // eşiğin çok altında
        { symbol: 'MIDUSDT', usdtVolume: '2000000' },
      ],
    });

    const result = await resolveSymbols();

    expect(result).toContain('BIGUSDT');
    expect(result).toContain('MIDUSDT');
    expect(result).not.toContain('TINYUSDT');
  });

  it('MIN_24H_VOLUME_USDT env ile override edilebilir', async () => {
    process.env.MARKET_DATA_SYMBOLS = 'TOP:10';
    process.env.MIN_24H_VOLUME_USDT = '100';
    getFuturesAllTickersMock.mockResolvedValue({
      data: [{ symbol: 'TINYUSDT', usdtVolume: '500' }],
    });

    const result = await resolveSymbols();

    expect(result).toContain('TINYUSDT'); // düşük eşikle artık geçiyor
  });
});

describe('startLsrPoller', () => {
  let startLsrPoller;
  let publisher;

  beforeEach(async () => {
    getFuturesActiveLongShortAccountDataMock.mockReset();
    vi.useFakeTimers();
    if (!startLsrPoller) {
      ({ startLsrPoller } = await import('../../src/bitget-ws.js'));
    }
    publisher = { publishLongShortRatio: vi.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  it('getFuturesActiveLongShortAccountData çağırır (doğru metot adı — B7 regresyonu)', async () => {
    getFuturesActiveLongShortAccountDataMock.mockResolvedValue({
      data: [{ longAccountRatio: '0.62', shortAccountRatio: '0.38', ts: '1717200000000' }],
    });

    await startLsrPoller(['BTCUSDT'], publisher);

    expect(getFuturesActiveLongShortAccountDataMock).toHaveBeenCalledWith({
      symbol: 'BTCUSDT',
      period: '5min',
    });
  });

  it('longAccountRatio/shortAccountRatio alanlarını publishLongShortRatio\'ya doğru eşler', async () => {
    getFuturesActiveLongShortAccountDataMock.mockResolvedValue({
      data: [{ longAccountRatio: '0.62', shortAccountRatio: '0.38', ts: '1717200000000' }],
    });

    await startLsrPoller(['BTCUSDT'], publisher);

    expect(publisher.publishLongShortRatio).toHaveBeenCalledWith('BTCUSDT', {
      longRatio: 0.62,
      shortRatio: 0.38,
    });
  });

  it('shortAccountRatio yoksa 1-longRatio ile tamamlar', async () => {
    getFuturesActiveLongShortAccountDataMock.mockResolvedValue({
      data: [{ longAccountRatio: '0.7', ts: '1717200000000' }],
    });

    await startLsrPoller(['BTCUSDT'], publisher);

    expect(publisher.publishLongShortRatio).toHaveBeenCalledWith('BTCUSDT', {
      longRatio: 0.7,
      shortRatio: expect.closeTo(0.3, 10),
    });
  });

  it('bir sembol hata verirse diğerleri etkilenmez (döngü kırılmaz)', async () => {
    getFuturesActiveLongShortAccountDataMock
      .mockRejectedValueOnce(new Error('symbol not found'))
      .mockResolvedValueOnce({ data: [{ longAccountRatio: '0.5', shortAccountRatio: '0.5' }] });

    await startLsrPoller(['BADSYMBOL', 'BTCUSDT'], publisher);

    expect(getFuturesActiveLongShortAccountDataMock).toHaveBeenCalledTimes(2);
    expect(publisher.publishLongShortRatio).toHaveBeenCalledOnce();
    expect(publisher.publishLongShortRatio).toHaveBeenCalledWith('BTCUSDT', expect.any(Object));
  });

  it('veri yoksa (data boş) publishLongShortRatio çağrılmaz', async () => {
    getFuturesActiveLongShortAccountDataMock.mockResolvedValue({ data: [] });

    await startLsrPoller(['BTCUSDT'], publisher);

    expect(publisher.publishLongShortRatio).not.toHaveBeenCalled();
  });
});
