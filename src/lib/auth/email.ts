import 'server-only';

import nodemailer, { type Transporter } from 'nodemailer';

import { getRuntimeConfig } from '@/lib/config';

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const { smtp } = getRuntimeConfig().auth;
  if (!smtp.configured || !smtp.host || !smtp.user || !smtp.password) {
    transporter = null;
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.password },
  });
  return transporter;
}

export async function sendAuthEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const config = getRuntimeConfig();
  const mailer = getTransporter();
  if (!mailer) {
    if (!config.isProduction && process.env.AUTH_DEV_EMAIL_LOG === 'true') {
      console.info(`[auth email] ${input.subject}\nTo: ${input.to}\n${input.text}`);
    }
    return;
  }
  await mailer.sendMail({
    from: config.auth.emailFrom,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
}

export function resetAuthEmailTransportForTests(): void {
  transporter = undefined;
}
