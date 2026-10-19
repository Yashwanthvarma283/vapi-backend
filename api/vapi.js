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

module.exports = async function handler(req, res) {
  if (req.method === "GET") return respond(res, 200, { ok: true, service: "vapi-telegram-webhook" });
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return respond(res, 405, { ok: false, error: "Method not allowed" });
  }

  const expected = process.env.WEBHOOK_SECRET;
  if (!expected || str(req.query && req.query.key) !== expected)
    return respond(res, 401, { ok: false, error: "Invalid webhook secret" });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const vapiKey = process.env.VAPI_PRIVATE_API_KEY;
  if (!token || !chatId || !vapiKey)
    return respond(res, 500, { ok: false, error: "Missing required environment variables" });

  const message = req.body && req.body.message && typeof req.body.message === "object" ? req.body.message : (req.body || {});
  if (message.type !== "end-of-call-report")
    return respond(res, 200, { ok: true, ignored: true, type: message.type || "unknown" });

  try {
    const call = message.call || {};
    const artifact = message.artifact || call.artifact || {};
    const callId = str(call.id);
    const transcript = str(artifact.transcript || message.transcript || call.transcript);
    const summary = str((message.analysis && message.analysis.summary) || (call.analysis && call.analysis.summary));
    const heading = `Vapi call completed\nCall ID: ${callId || "not provided"}\nEnded: ${str(message.endedReason || "unknown")}${summary ? `\nSummary: ${summary}` : ""}\n\n`;
    await sendTelegramText(token, chatId, heading + (transcript || "No transcript was included in the end-of-call report."));

    if (!callId) return respond(res, 200, { ok: true, transcriptSent: true, recordingSent: false, warning: "No call.id; recording skipped." });
    const recording = await downloadRecording(callId, vapiKey);
    await sendTelegramRecording(token, chatId, recording, `vapi-call-${callId}.wav`);
    return respond(res, 200, { ok: true, transcriptSent: true, recordingSent: true, callId });
  } catch (e) {
    console.error("Vapi -> Telegram delivery failed:", e && e.message ? e.message : e);
    return respond(res, 502, { ok: false, error: e && e.message ? e.message : "Delivery failed" });
  }
};
