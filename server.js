const express = require("express");
const multer = require("multer");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const upload = multer();

app.use(express.json());

/* --------------------------------------------------
   CORS MIDDLEWARE (ALLOWS YOUR FRONTEND TO CONNECT)
-------------------------------------------------- */
app.use((req, res, next) => {
  const allowedOrigins = [
    "https://ielts.allthingsverbal.com",
    "https://www.ielts.allthingsverbal.com"
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

/* --------------------------------------------------
   ROOT CHECK ENDPOINT
-------------------------------------------------- */
app.get("/", (req, res) => {
  res.send("IELTS AI Assessor running");
});

/* --------------------------------------------------
   API: UPLOAD AUDIO (MAIN FUNCTION)
-------------------------------------------------- */
app.post("/api/upload-audio", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file received" });
    }

    const audioBuffer = req.file.buffer;

    /* ------------------------------
       1. TRANSCRIBE USING OPENAI
    ------------------------------ */
    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: (() => {
        const form = new FormData();
        form.append("file", audioBuffer, "audio.webm");
        form.append("model", "gpt-4o-transcribe");
        return form;
      })(),
    });

    const whisperJson = await whisperRes.json();

    if (!whisperRes.ok) {
      console.log("Whisper error:", whisperJson);
      return res.status(500).json({ error: "Transcription failed", details: whisperJson });
    }

    const transcript = whisperJson.text;

    /* ------------------------------
       2. GET FEEDBACK USING CHATGPT
    ------------------------------ */
    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an IELTS speaking evaluator. Score fluency, coherence, grammar, and pronunciation."
          },
          {
            role: "user",
            content: transcript
          }
        ]
      })
    });

    const chatJson = await chatRes.json();

    if (!chatRes.ok) {
      console.log("ChatGPT error:", chatJson);
      return res.status(500).json({ error: "Feedback generation failed", details: chatJson });
    }

    const feedback = chatJson.choices[0].message.content;

    /* ------------------------------
       3. OPTIONAL: ELEVENLABS FEEDBACK AUDIO
    ------------------------------ */

    let audioUrl = null;

    if (process.env.ELEVEN_API_KEY && process.env.ELEVEN_VOICE_ID) {
      const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVEN_VOICE_ID}`, {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVEN_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: feedback,
        })
      });

      if (ttsRes.ok) {
        const audioBuffer = await ttsRes.arrayBuffer();

        // Save inside Render's /tmp (ephemeral)
        const fs = require("fs");
        const filePath = `/tmp/feedback_${Date.now()}.mp3`;
        fs.writeFileSync(filePath, Buffer.from(audioBuffer));

        audioUrl = `/public/${filePath.split("/").pop()}`;
      }
    }

    res.json({
      transcript,
      feedback,
      audioUrl,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

/* --------------------------------------------------
   STATIC FILE HANDLER FOR PUBLIC AUDIO (optional)
-------------------------------------------------- */
app.use("/public", express.static("/tmp"));

/* --------------------------------------------------
   START SERVER
-------------------------------------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
