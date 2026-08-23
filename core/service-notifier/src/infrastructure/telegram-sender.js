// Telegram Bot API gönderici. Ek bağımlılık yok — Node 20+ global fetch yeterli.
//
// Tasarım notu: send() ASLA throw etmez. Bildirim ikincil bir yan etkidir;
// Telegram'a ulaşılamaması sinyal akışını durdurmamalı.

const API = 'https://api.telegram.org';

export function makeTelegramSender({ botToken, chatId, log, fetchFn = fetch }) {
  const enabled = Boolean(botToken && chatId);

  async function send(text) {
    if (!enabled) return { ok: false };

    try {
      const res = await fetchFn(`${API}/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        log.error(`Telegram gönderilemedi (${res.status}): ${data.description ?? 'bilinmeyen hata'}`);
        return { ok: false };
      }
      return { ok: true };
    } catch (err) {
      log.error(`Telegram bağlantı hatası: ${err.message}`);
      return { ok: false };
    }
  }

  return { send, enabled };
}
