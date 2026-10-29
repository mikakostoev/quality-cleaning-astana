import { localMailAllowed, resendConfigured } from './auth.mjs';

export async function sendLoginCode({ to, code, fetchImpl = globalThis.fetch } = {}) {
  if (typeof to !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    throw Object.assign(new Error('mail payload'), { code: 'SEND_FAILED' });
  }
  if (resendConfigured()) {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: [to],
        subject: 'Код для входа в админку',
        text: [
          `Код для входа в админку Quality Клининг: ${code}`,
          '',
          'Код действует 10 минут. Если вы не запрашивали вход, проигнорируйте это письмо.',
        ].join('\n'),
      }),
    });
    if (!response.ok) throw Object.assign(new Error('resend failed'), { code: 'SEND_FAILED' });
    return { id: 'sent' };
  }
  if (localMailAllowed()) {
    console.info(`admin otp (local): ${code}`);
    return { id: 'local' };
  }
  throw Object.assign(new Error('mail not configured'), { code: 'SEND_FAILED' });
}
