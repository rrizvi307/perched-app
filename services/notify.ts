import { devLog } from './logger';

const SENDGRID_KEY = process.env.SENDGRID_API_KEY;

export async function sendSigninNotification(email: string, ip?: string, meta?: any) {
  const subject = `New sign-in to your Perched account`;
  const text = `We detected a sign-in to your account${ip ? ' from IP ' + ip : ''}.

If this was you, no action is needed. If you did not sign in, please reset your password.`;

  // Prefer SendGrid REST API if API key is available
  if (SENDGRID_KEY) {
    try {
      await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SENDGRID_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }], subject }],
          from: { email: 'perchedappteam@gmail.com', name: 'Perched' },
          content: [{ type: 'text/plain', value: text }],
        }),
      });
      return;
    } catch (e) {
      devLog('sendgrid send failed', e);
    }
  }

  // Fallback: write a Firestore doc so a Cloud Function or admin can notify
  try {
    // dynamic import to avoid hard dependency
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const firebase = require('firebase/compat/app');
    // @ts-ignore
    require('firebase/compat/firestore');
    if (firebase && firebase.apps && firebase.apps.length) {
      const db = firebase.firestore();
      await db.collection('login_notifications').add({ email, ip: ip || null, meta: meta || {}, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      return;
    }
  } catch (e) {
    // ignore
  }

  // Last resort: log to console
  devLog('signin notification (fallback):', { email, ip, meta });
}

export default { sendSigninNotification };
