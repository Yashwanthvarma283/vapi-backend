# Vapi → Telegram Call Forwarder

Automatically sends the final transcript and call recording from each completed Vapi call to a Telegram chat. No Make.com required.

## 1. Create/prepare the Telegram bot

1. Open Telegram and chat with [@BotFather](https://t.me/BotFather).
2. Create a bot with `/newbot` or use your existing bot.
3. Copy its token into `TELEGRAM_BOT_TOKEN`.
4. Open your bot's chat and press **Start**. This is required before it can message you.
5. Use your private chat ID for `TELEGRAM_CHAT_ID`.
6. If the bot token was ever shown in a screenshot or shared, revoke it in BotFather and use the new token.

## 2. Deploy on Render

1. Upload these files to a new GitHub repository.
2. In Render, choose **New → Web Service** and connect that repository.
3. Runtime: **Node**. Build command: `npm install`. Start command: `npm start`.
4. Add these Environment Variables in Render:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `VAPI_PRIVATE_API_KEY` (Vapi Private API Key, not public key)
   - `WEBHOOK_SECRET` (a long random string)
5. Deploy and copy the service URL, e.g. `https://your-service.onrender.com`.
6. Test `https://your-service.onrender.com/health`; it should return `{"ok":true}`.

## 3. Connect Vapi

1. In Vapi, open your assistant and its **Advanced / Server URL** settings.
2. Set the Server URL to:
   `https://YOUR-RENDER-SERVICE.onrender.com/vapi/webhook?key=YOUR_WEBHOOK_SECRET`
3. Configure server messages to include **`end-of-call-report`**. You can turn off unneeded event types for this endpoint; this app ignores all events except `end-of-call-report` anyway.
4. In **Advanced → Recording & Artifacts**, enable Audio Recording and Transcript.
5. Publish the assistant.

## 4. Test

Complete a test call. After it ends, the Telegram chat should receive a transcript message (or a `.txt` attachment for a long transcript), then the audio recording as a document. The first request to a free Render service may take a little time while it wakes up.

## Notes

- Recording is downloaded from Vapi's authenticated `/call/{id}/mono-recording` endpoint using the private API key.
- Do not commit `.env` or real secrets to GitHub. Set secrets only in Render's Environment settings.
- For privacy, tell callers that calls may be recorded and obtain any consent required by applicable law.
