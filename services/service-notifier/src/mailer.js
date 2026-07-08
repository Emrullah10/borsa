import nodemailer from 'nodemailer';
import helper from '@borsa-bot/helper';

let transporter = null;
let emailTo = null;

export function initMailer(gmailUser, gmailAppPassword, to) {
  emailTo = to;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailAppPassword },
  });
}

export async function sendSignalEmail(subject, html) {
  if (!transporter) throw new Error('Mailer başlatılmadı — initMailer() çağrılmadı');
  try {
    await transporter.sendMail({
      from: `"Scalp Asistanı" <${transporter.options.auth.user}>`,
      to: emailTo,
      subject,
      html,
    });
    helper.log.info(`E-posta gönderildi: ${subject}`);
  } catch (err) {
    helper.log.error('E-posta gönderim hatası:', err.message);
  }
}
