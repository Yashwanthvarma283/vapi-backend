# Vapi → Telegram on Vercel

## Files
- `api/vapi.js` — Vercel serverless webhook
- `package.json` — project metadata

## Deploy
Copy `api/vapi.js` and `package.json` into the root of your existing GitHub repository. Do not upload secrets or `.env` files.

In Vercel → Project → Settings → Environment Variables, set:
- `TELEGRAM_BOT_TOKEN` — regenerated Telegram bot token
- `TELEGRAM_CHAT_ID` — your private chat ID
- `VAPI_PRIVATE_API_KEY` — Vapi private API key
- `WEBHOOK_SECRET` — a long random secret you create

Redeploy after changing environment variables.

## Vapi Server URL
`https://YOUR-PROJECT.vercel.app/api/vapi?key=YOUR_WEBHOOK_SECRET`

The path is `/api/vapi` because the file is `api/vapi.js`. Do not use `/vapi/webhook` unless you configure a matching rewrite.

In Vapi → Assistant → Advanced → Webhook Server, enable `end-of-call-report` and publish.

## Test
Open `https://YOUR-PROJECT.vercel.app/api/vapi` in a browser. It should return `{"ok":true,"service":"vapi-telegram-webhook"}`. Then make a test call.

The handler sends the transcript and retrieves the recording through Vapi's authenticated `/call/{id}/mono-recording` endpoint, then sends the audio as a Telegram document. Failed deliveries return HTTP 502 and log the reason in Vercel.

Make sure you have started the bot in Telegram and that `TELEGRAM_CHAT_ID` is correct.
