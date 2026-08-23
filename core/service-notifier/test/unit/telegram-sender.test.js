import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTelegramSender } from '../../src/infrastructure/telegram-sender.js';

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('makeTelegramSender', () => {
  beforeEach(() => vi.clearAllMocks());

  it('doğru Telegram API endpoint\'ine POST atar', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const sender = makeTelegramSender({ botToken: 'TOK', chatId: '42', log, fetchFn });

    await sender.send('merhaba');

    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toContain('/botTOK/sendMessage');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.chat_id).toBe('42');
    expect(body.text).toBe('merhaba');
    expect(body.parse_mode).toBe('HTML');
  });

  it('API hata dönerse loglar ama exception fırlatmaz', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ description: 'chat not found' }),
    });
    const sender = makeTelegramSender({ botToken: 'TOK', chatId: '42', log, fetchFn });

    await expect(sender.send('x')).resolves.toEqual({ ok: false });
    expect(log.error).toHaveBeenCalled();
  });

  it('ağ hatasında çökmez — sinyal akışı bildirim yüzünden durmamalı', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const sender = makeTelegramSender({ botToken: 'TOK', chatId: '42', log, fetchFn });

    await expect(sender.send('x')).resolves.toEqual({ ok: false });
    expect(log.error).toHaveBeenCalled();
  });

  it('token/chatId eksikse enabled=false ve istek atmaz', async () => {
    const fetchFn = vi.fn();
    const sender = makeTelegramSender({ botToken: '', chatId: '', log, fetchFn });

    expect(sender.enabled).toBe(false);
    await sender.send('x');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('token ve chatId varsa enabled=true', () => {
    const sender = makeTelegramSender({ botToken: 'T', chatId: '1', log, fetchFn: vi.fn() });
    expect(sender.enabled).toBe(true);
  });
});
