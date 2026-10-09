/**
 * Email delivery via Gmail SMTP (nodemailer) — free, no custom domain needed.
 *
 * Graceful when unconfigured: if GMAIL_USER / GMAIL_APP_PASSWORD are missing,
 * sends are skipped with a server-side warning instead of throwing, so local
 * dev and misconfigured deploys never crash the request path.
 *
 * Setup (one time):
 *   1. Google Account → Security → turn ON 2-Step Verification.
 *   2. Security → App passwords → generate one for "Mail".
 *   3. Set GMAIL_USER to your Gmail address and GMAIL_APP_PASSWORD to the
 *      16-character app password (NOT your real Google password).
 */
import * as nodemailer from 'nodemailer';
import dns from 'node:dns/promises';
import { LOGO_PNG_BASE64 } from './logoImage';

let transporter: nodemailer.Transporter | null = null;

async function getTransporter(): Promise<nodemailer.Transporter | null> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (!transporter) {
    // Render's containers have no IPv6 route to the open internet. Node's
    // DNS lookup can return Gmail's IPv6 address first → ENETUNREACH on
    // every send. Resolve to IPv4 explicitly so the connection is reliable.
    let host = 'smtp.gmail.com';
    try {
      const v4 = await dns.resolve4('smtp.gmail.com');
      if (v4.length > 0) host = v4[0];
    } catch {
      // fall through to the hostname; nodemailer will resolve it
    }
    transporter = nodemailer.createTransport({
      host,
      port: 465,
      secure: true,
      auth: { user, pass },
      // connecting by IP: keep TLS cert verification against the real name
      tls: { servername: 'smtp.gmail.com' },
      // Render's free tier can be slow/flaky — generous timeouts plus
      // retry below instead of failing on the first hiccup.
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 45000,
    });
    console.log(`[email] Gmail SMTP transporter ready (host=${host}, ipv4-forced)`);
  }
  return transporter;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

/** Send a password-reset email. Throws only when the SMTP send fails. */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const mailer = await getTransporter();
  const fromAddr = process.env.EMAIL_FROM || process.env.GMAIL_USER;
  if (!mailer || !fromAddr) {
    console.warn('[email] GMAIL_USER or GMAIL_APP_PASSWORD is not set — skipping password reset email');
    return;
  }
  const mailOptions = {
    from: `Consistency Guard <${fromAddr}>`,
    to,
    subject: 'Reset your Consistency Guard password',
    text:
      `You requested a password reset for Consistency Guard.\n\n` +
      `Reset your password (expires in 60 minutes):\n${resetUrl}\n\n` +
      `If you didn't request this, you can safely ignore this email.`,
    html:
      `<div style="background-color: #f5f5f4; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">` +
      `<div style="max-width: 460px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; padding: 40px 32px; text-align: center;">` +
      `<img src="cid:cg-logo" alt="Consistency Guard" width="72" style="width: 72px; height: auto; display: block; margin: 0 auto 20px;" />` +
      `<h2 style="font-size: 22px; color: #1c1917; margin: 0 0 12px;">Reset your password</h2>` +
      `<p style="font-size: 14px; line-height: 1.6; color: #57534e; margin: 0 0 24px;">You requested a password reset for Consistency Guard. Click the button below — the link expires in 60 minutes.</p>` +
      `<a href="${resetUrl}" style="display: inline-block; padding: 12px 32px; background-color: #0d9488; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 9999px;">Reset password</a>` +
      `<p style="font-size: 12px; color: #a8a29e; margin: 24px 0 0;">If the button doesn't work, paste this link into your browser:<br /><a href="${resetUrl}" style="color: #0d9488; word-break: break-all;">${resetUrl}</a></p>` +
      `<hr style="border: none; border-top: 1px solid #e7e5e4; margin: 28px 0 16px;" />` +
      `<p style="font-size: 12px; color: #a8a29e; margin: 0;">If you didn't request this, you can safely ignore this email.</p>` +
      `</div></div>`,
    attachments: [
      {
        filename: 'logo.png',
        content: Buffer.from(LOGO_PNG_BASE64, 'base64'),
        cid: 'cg-logo',
      },
    ],
  };

  // Retry transient network failures (timeouts, dropped connections) —
  // auth errors (EAUTH) are thrown immediately since retrying won't help.
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await mailer.sendMail(mailOptions);
      if (attempt > 1) console.log(`[email] password reset email sent on attempt ${attempt}`);
      return;
    } catch (err) {
      lastError = err;
      const code = (err as { code?: string }).code;
      const transient = code === 'ETIMEDOUT' || code === 'ECONNECTION' || code === 'ESOCKET' || code === 'ETLS';
      if (!transient || attempt === 3) throw err;
      console.warn(`[email] send attempt ${attempt} failed (${code}) — retrying…`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastError;
}
