import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeMailer } from '../../src/infrastructure/mailer.js';

describe('mailer', () => {
  let transport;
  let log;
  let mailer;

  beforeEach(() => {
    transport = {
      options: { auth: { user: 'bot@example.com' } },
      sendMail: vi.fn().mockResolvedValue(undefined),
    };
    log = { info: vi.fn(), error: vi.fn() };
    mailer = makeMailer({ transport, log });
  });

  it('sendSignalEmail: doğru from/to/subject/html ile gönderir', async () => {
    await mailer.sendSignalEmail('Subject', '<html></html>', 'trader@example.com');
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: '"Scalp Asistanı" <bot@example.com>',
      to: 'trader@example.com',
      subject: 'Subject',
      html: '<html></html>',
    });
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Subject'));
  });

  it('gönderim hatasında log.error çağırır, throw etmez', async () => {
    transport.sendMail.mockRejectedValue(new Error('smtp down'));
    await mailer.sendSignalEmail('Subject', '<html></html>', 'trader@example.com');
    expect(log.error).toHaveBeenCalledWith('E-posta gönderim hatası:', 'smtp down');
  });
});
