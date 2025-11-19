IELTS AI Assessor — Deployment Notes

This repo contains a simple Node/Express backend that:
- accepts an uploaded audio file (multipart/form-data 'audio')
- sends audio to OpenAI Whisper for transcription
- sends transcript to OpenAI Chat for evaluation (IELTS rubric)
- optionally uses ElevenLabs for TTS feedback (if keys provided)

ENVIRONMENT VARIABLES (to set on Render/Vercel):
- OPENAI_API_KEY   (required)
- ELEVEN_API_KEY   (optional, for TTS)
- ELEVEN_VOICE_ID  (optional, ElevenLabs voice id to use for TTS)

Quick deploy on Render:
1. Create a new Web Service on Render and connect this GitHub repo.
2. Set the start command: `node server.js`
3. Add the environment variables in the Render dashboard.
4. Deploy. The service URL will be like https://<your-service>.onrender.com

Client:
- Upload the frontend `speaking_practice.html` to your site.
- Update the client script SERVER_URL to point to the Render service URL.
