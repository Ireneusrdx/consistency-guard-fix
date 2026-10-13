/**
 * Email delivery via Brevo's transactional HTTP API — sends from your domain.
 *
 * Why HTTP and not SMTP: Render's hosting drops outbound SMTP connections
 * (port 587), so nodemailer-style SMTP sends hang until they time out. The
 * Brevo API runs over HTTPS (port 443), which is always open.
 *
 * Graceful when unconfigured: if BREVO_API_KEY / EMAIL_FROM are missing,
 * sends are skipped with a server-side warning instead of throwing, so local
 * dev and misconfigured deploys never crash the request path.
 *
 * Setup (one time):
 *   1. Brevo dashboard → SMTP & API → API Keys tab → generate an API key
 *      (this is NOT the SMTP key — it's the API key from the same page).
 *   2. Set BREVO_API_KEY to that key.
 *   3. Set EMAIL_FROM to a sender on your authenticated domain,
 *      e.g. hello@consistencyguard.me.
 *   4. Set FRONTEND_URL=https://app.consistencyguard.me so reset links
 *      point at your domain.
 */

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export function isEmailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_FROM);
}

/** Send a password-reset email. Throws only when the API send fails. */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromAddr = process.env.EMAIL_FROM;
  if (!apiKey || !fromAddr) {
    console.warn('[email] BREVO_API_KEY or EMAIL_FROM is not set — skipping password reset email');
    return;
  }

  const textBody =
    `You requested a password reset for Consistency Guard.\n\n` +
    `Reset your password (expires in 60 minutes):\n${resetUrl}\n\n` +
    `If you didn't request this, you can safely ignore this email.`;

  const htmlBody =
    `<div style="background-color: #f5f5f4; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">` +
    `<div style="max-width: 460px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; padding: 40px 32px; text-align: center;">` +
    `<h2 style="font-size: 22px; color: #1c1917; margin: 0 0 12px;">Reset your password</h2>` +
    `<p style="font-size: 14px; line-height: 1.6; color: #57534e; margin: 0 0 24px;">You requested a password reset for Consistency Guard. Click the button below — the link expires in 60 minutes.</p>` +
    `<a href="${resetUrl}" style="display: inline-block; padding: 12px 32px; background-color: #0d9488; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 9999px;">Reset password</a>` +
    `<p style="font-size: 12px; color: #a8a29e; margin: 24px 0 0;">If the button doesn't work, paste this link into your browser:<br /><a href="${resetUrl}" style="color: #0d9488; word-break: break-all;">${resetUrl}</a></p>` +
    `<hr style="border: none; border-top: 1px solid #e7e5e4; margin: 28px 0 16px;" />` +
    `<p style="font-size: 12px; color: #a8a29e; margin: 0;">If you didn't request this, you can safely ignore this email.</p>` +
    `</div></div>`;

  const payload = {
    sender: { name: 'Consistency Guard', email: fromAddr },
    to: [{ email: to }],
    subject: 'Reset your Consistency Guard password',
    htmlContent: htmlBody,
    textContent: textBody,
  };

  // Retry transient network failures — 4xx responses (bad key, rejected
  // sender) are thrown immediately since retrying won't help.
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(BREVO_API_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        if (attempt > 1) console.log(`[email] password reset email sent on attempt ${attempt}`);
        return;
      }
      const detail = (await res.text()).slice(0, 200);
      const err = new Error(`Brevo API ${res.status}: ${detail}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number }).status;
      const transient =
        status === undefined || status === 429 || (status >= 500 && status < 600);
      if (!transient || attempt === 3) throw err;
      console.warn(`[email] send attempt ${attempt} failed (${status ?? 'network'}) — retrying…`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastError;
}
