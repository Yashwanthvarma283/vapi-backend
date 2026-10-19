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

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const vapiKey = process.env.VAPI_PRIVATE_API_KEY;

    if (!token || !chatId || !vapiKey) {
      throw new Error('Missing Telegram or Vapi environment variables');
    }

    const telegram = `https://api.telegram.org/bot${token}`;


// Format the transcript for easy reading in Telegram
const artifact = message.artifact || {};
const rawTranscript = artifact.transcript || "No transcript available";

const callId = message.call?.id;
const startedAt = message.startedAt || message.call?.startedAt;
const endedAt = message.endedAt || message.call?.endedAt;

const formatTime = (value) => {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : date.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
};

const formattedTranscript = [
  "📞 CALL SUMMARY",
  "━━━━━━━━━━━━━━━━━━",
  "",
  `🆔 Call ID: ${callId || "Unavailable"}`,
  `🕒 Started: ${formatTime(startedAt)}`,
  `🏁 Ended: ${formatTime(endedAt)}`,
  "",
  "📝 CONVERSATION TRANSCRIPT",
  "━━━━━━━━━━━━━━━━━━",
  "",
  rawTranscript.trim()
].join("\n");

// Telegram message limit: split long transcripts safely
const chunks = [];
const maxLength = 3500;
let remaining = formattedTranscript;

while (remaining.length > maxLength) {
  let splitAt = remaining.lastIndexOf("\n", maxLength);
  if (splitAt < 1000) splitAt = maxLength;

  chunks.push(remaining.slice(0, splitAt));
  remaining = remaining.slice(splitAt).trimStart();
}

if (remaining.length) chunks.push(remaining);

for (let i = 0; i < chunks.length; i++) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text:
          chunks.length > 1
            ? `${i === 0 ? "" : "📝 TRANSCRIPT (continued)\n\n"}${chunks[i]}`
            : chunks[i]
      })
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(`Telegram message failed: ${JSON.stringify(result)}`);
  }
}

    // 2. Download recording from Vapi
    

    if (!callId) {
      console.log('Transcript sent; no call ID found for recording');
      return res.status(200).json({
        delivered: true,
        recording: 'no-call-id'
      });
    }

    const recordingResponse = await fetch(
      `https://api.vapi.ai/call/${encodeURIComponent(callId)}/mono-recording`,
      {
        headers: {
          Authorization: `Bearer ${vapiKey}`
        }
      }
    );

    if (!recordingResponse.ok) {
      const errorText = await recordingResponse.text();
      throw new Error(`Vapi recording error: ${recordingResponse.status} ${errorText}`);
    }

    const audio = await recordingResponse.arrayBuffer();

    if (!audio.byteLength) {
      throw new Error('Vapi returned an empty recording');
    }

    // 3. Send recording to Telegram
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append(
      'document',
      new Blob([audio], { type: 'audio/wav' }),
      `call-${callId}.wav`
    );

    const audioResponse = await fetch(`${telegram}/sendDocument`, {
      method: 'POST',
      body: form
    });

    const audioResult = await audioResponse.json();

    if (!audioResponse.ok || !audioResult.ok) {
      throw new Error(`Telegram audio error: ${JSON.stringify(audioResult)}`);
    }

    console.log('Transcript and recording delivered to Telegram');

    return res.status(200).json({
      delivered: true,
      recording: true
    });
  } catch (error) {
    console.error('Webhook delivery failed:', error);
    return res.status(500).json({
      delivered: false,
      error: error.message
    });
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
