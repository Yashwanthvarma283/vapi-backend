# Vapi → Telegram (Vercel)

This project includes a root `server.js` entrypoint, specifically to avoid Vercel's `No entrypoint found` error.

## GitHub
Upload these three files/folders to the ROOT of your `vapi-backend` repository, replacing the existing `server.js` and `package.json`:
- `server.js`
- `package.json`
- `vercel.json`

Do not put them inside an extra nested folder. Do not upload `.env` or secrets.

## Vercel environment variables
Set these under Project → Settings → Environment Variables:
- `TELEGRAM_BOT_TOKEN` — regenerate your bot token with @BotFather first if it was exposed
- `TELEGRAM_CHAT_ID` — your Telegram chat ID
- `VAPI_PRIVATE_API_KEY` — Vapi private API key
- `WEBHOOK_SECRET` — a new long random secret

Redeploy after setting variables.

## Vercel settings
- Framework Preset: Other
- Root Directory: `./`
- Remove any custom Build Command and Output Directory overrides.

## Vapi
Set Server URL to:
`https://YOUR-PROJECT.vercel.app/vapi/webhook?key=YOUR_WEBHOOK_SECRET`

Enable the `end-of-call-report` server message and publish the assistant.

## Test
Open `/health` on your deployment; expected JSON: `{"ok":true}`. Then make a test call. The webhook sends the transcript and attempts to fetch the recording from Vapi's authenticated recording endpoint, then forwards it to Telegram.
