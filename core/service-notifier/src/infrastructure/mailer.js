export function makeMailer({ transport, log }) {
  async function sendSignalEmail(subject, html, emailTo) {
    try {
      await transport.sendMail({
        from: `"Scalp Asistanı" <${transport.options.auth.user}>`,
        to: emailTo,
        subject,
        html,
      });
      log.info(`E-posta gönderildi: ${subject}`);
    } catch (err) {
      log.error('E-posta gönderim hatası:', err.message);
    }
  }

  return { sendSignalEmail };
}
