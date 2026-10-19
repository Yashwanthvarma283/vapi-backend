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
  // Authenticate using the secret included in the Server URL query string.
  if (!WEBHOOK_SECRET || req.query.key !== WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  // Respond quickly to Vapi. Process only completed-call reports.
  const message = req.body?.message;
  if (message?.type !== 'end-of-call-report') {
    return res.status(200).json({ ok: true, ignored: true });
  }
  res.status(200).json({ ok: true, received: true });

  try {
    const missing = requiredEnv();
    if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);

    const callId = message.call?.id || message.call?.callId || message.callId;
    const transcript = typeof message.artifact?.transcript === 'string'
      ? message.artifact.transcript
      : Array.isArray(message.artifact?.messages)
        ? message.artifact.messages.map((m) => `${m.role === 'assistant' ? 'Assistant' : m.role === 'user' ? 'User' : (m.role || 'Speaker')}: ${m.message || m.content || ''}`).join('\n')
        : '';

    const title = `Vapi call completed${callId ? ` — ${callId}` : ''}`;
    const text = `${title}\n\n${transcript || '(No transcript was included in the report.)'}`;
    const telegramBase = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

    // Telegram text messages have a 4096-character limit; send long transcripts as .txt files.
    if (text.length <= 4000) {
      await telegramJson(`${telegramBase}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true
      });
    } else {
      await telegramJson(`${telegramBase}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: `${title}\nFull transcript is attached as a text file.`
      });
      const transcriptFile = new Blob([text], { type: 'text/plain; charset=utf-8' });
      const form = new FormData();
      form.append('chat_id', TELEGRAM_CHAT_ID);
      form.append('document', transcriptFile, `vapi-transcript-${safeName(callId)}.txt`);
      await telegramForm(`${telegramBase}/sendDocument`, form);
    }

    // Use Vapi's authenticated artifact endpoint; it follows the short-lived redirect.
    if (callId) {
      const audioResponse = await fetch(`https://api.vapi.ai/call/${encodeURIComponent(callId)}/mono-recording`, {
        headers: { Authorization: `Bearer ${VAPI_PRIVATE_API_KEY}` },
        redirect: 'follow'
      });
      if (!audioResponse.ok) {
        const details = await audioResponse.text().catch(() => '');
        throw new Error(`Vapi recording download failed (${audioResponse.status}): ${details.slice(0, 300)}`);
      }
      const audioBlob = await audioResponse.blob();
      const contentType = audioResponse.headers.get('content-type') || '';
      const ext = contentType.includes('mpeg') ? 'mp3' : contentType.includes('mp4') ? 'mp4' : 'wav';
      const form = new FormData();
      form.append('chat_id', TELEGRAM_CHAT_ID);
      form.append('caption', `Call recording${callId ? ` — ${callId}` : ''}`);
      form.append('document', audioBlob, `vapi-recording-${safeName(callId)}.${ext}`);
      await telegramForm(`${telegramBase}/sendDocument`, form);
    } else {
      await telegramJson(`${telegramBase}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: 'Could not attach recording: Vapi report did not include a call ID.'
      });
    }
  } catch (error) {
    console.error('Forwarding failed:', error);
    // Try to notify the owner; do not expose secrets.
    try {
      await telegramJson(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: `Vapi forwarding error: ${String(error.message || error).slice(0, 800)}`
      });
    } catch (notifyError) {
      console.error('Could not notify Telegram:', notifyError.message);
    }
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

app.listen(PORT, () => console.log(`Vapi → Telegram forwarder listening on ${PORT}`));
