// Vapi -> Telegram webhook for Vercel
// Required environment variables: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
// VAPI_PRIVATE_API_KEY, WEBHOOK_SECRET
// Vapi Server URL: https://YOUR-PROJECT.vercel.app/api/vapi?key=YOUR_WEBHOOK_SECRET

const TELEGRAM_API = "https://api.telegram.org";
const VAPI_API = "https://api.vapi.ai";

function respond(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(body));
}
function str(v) { return typeof v === "string" ? v.trim() : ""; }

async function sendTelegramText(token, chatId, text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 3900) chunks.push(text.slice(i, i + 3900));
  if (!chunks.length) chunks.push("No transcript was included in the Vapi report.");
  for (const chunk of chunks) {
    const r = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(`Telegram sendMessage failed (${r.status}): ${data.description || "unknown error"}`);
  }
}

async function sendTelegramRecording(token, chatId, buffer, filename) {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", "Vapi call recording");
  form.append("document", new Blob([buffer], { type: "audio/wav" }), filename);
  const r = await fetch(`${TELEGRAM_API}/bot${token}/sendDocument`, { method: "POST", body: form });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) throw new Error(`Telegram sendDocument failed (${r.status}): ${data.description || "unknown error"}`);
}

async function downloadRecording(callId, vapiKey) {
  const r = await fetch(`${VAPI_API}/call/${encodeURIComponent(callId)}/mono-recording`, {
    headers: { Authorization: `Bearer ${vapiKey}` }, redirect: "follow"
  });
  if (!r.ok) throw new Error(`Vapi recording download failed (${r.status}): ${(await r.text().catch(() => "")).slice(0, 250)}`);
  const bytes = await r.arrayBuffer();
  if (!bytes.byteLength) throw new Error("Vapi returned an empty recording.");
  return Buffer.from(bytes);
}


module.exports = async (req, res) => {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, service: "vapi-telegram-webhook" });
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  if (req.query.key !== process.env.WEBHOOK_SECRET) {
    return res.status(401).send("Unauthorized");
  }

  try {
    const payload = req.body;
    const message = payload.message || payload;

    if (message.type !== "end-of-call-report") {
      return res.status(200).send("Ignored");
    }

    const transcript =
      message.artifact?.transcript || "No transcript available";
    const callId = message.call?.id;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

    for (let i = 0; i < transcript.length; i += 3500) {
      const response = await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: transcript.slice(i, i + 3500),
        }),
      });

      if (!response.ok) {
        throw new Error(`Telegram failed: ${await response.text()}`);
      }
    }

    if (callId && process.env.VAPI_PRIVATE_API_KEY) {
      const recordingResponse = await fetch(
        `https://api.vapi.ai/call/${callId}/mono-recording`,
        {
          headers: {
            Authorization: `Bearer ${process.env.VAPI_PRIVATE_API_KEY}`,
          },
        }
      );

      if (recordingResponse.ok) {
        const audio = await recordingResponse.arrayBuffer();
        const form = new FormData();
        form.append(
          "chat_id",
          chatId
        );
        form.append(
          "document",
          new Blob([audio], { type: "audio/wav" }),
          "call-recording.wav"
        );

        await fetch(
          `https://api.telegram.org/bot${botToken}/sendDocument`,
          { method: "POST", body: form }
        );
      }
    }

    return res.status(200).send("Delivered");
  } catch (error) {
    console.error(error);
    return res.status(500).send("Delivery failed");
  }
};