import express from 'express';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const VAPI_PRIVATE_API_KEY = process.env.VAPI_PRIVATE_API_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

function requiredEnv() {
  const missing = [
    ['TELEGRAM_BOT_TOKEN', TELEGRAM_BOT_TOKEN],
    ['TELEGRAM_CHAT_ID', TELEGRAM_CHAT_ID],
    ['VAPI_PRIVATE_API_KEY', VAPI_PRIVATE_API_KEY],
    ['WEBHOOK_SECRET', WEBHOOK_SECRET]
  ].filter(([, value]) => !value).map(([name]) => name);
  return missing;
}

app.get('/', (_req, res) => res.status(200).send('Vapi → Telegram forwarder is running.'));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/vapi/webhook', async (req, res) => {
  try {
    if (
      !process.env.WEBHOOK_SECRET ||
      req.query.key !== process.env.WEBHOOK_SECRET
    ) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const message = req.body?.message || req.body;

    if (message.type !== 'end-of-call-report') {
      return res.status(200).json({ ignored: message.type });
    }

    const transcript =
      message.artifact?.transcript || 'No transcript available';

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      throw new Error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    }

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Vapi call transcript:\n\n${transcript}`.slice(0, 4000)
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.ok) {
      console.error('Telegram API error:', result);
      throw new Error('Telegram rejected the message');
    }

    console.log('Telegram delivery confirmed');

    return res.status(200).json({ delivered: true });
  } catch (error) {
    console.error('Webhook delivery failed:', error);
    return res.status(500).json({ delivered: false });
  }
});

function safeName(value) {
  return String(value || 'call').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

async function telegramJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(`Telegram API error (${response.status}): ${result.description || 'request failed'}`);
  return result;
}

async function telegramForm(url, form) {
  const response = await fetch(url, { method: 'POST', body: form });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(`Telegram upload error (${response.status}): ${result.description || 'request failed'}`);
  return result;
}

// Vercel detects this root server.js entrypoint. For local use, run with `npm start`.
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => console.log(`Vapi → Telegram forwarder listening on ${PORT}`));
}

export default app;
