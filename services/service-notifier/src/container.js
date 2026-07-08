import nodemailer from 'nodemailer';
import helper from '@borsa-bot/helper';
import { makeMailer } from '@borsa-bot/core-notifier/src/infrastructure/mailer.js';

export function buildContainer({ gmailUser, gmailAppPassword }) {
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailAppPassword },
  });

  const mailer = makeMailer({ transport, log: helper.log });

  return { mailer };
}
