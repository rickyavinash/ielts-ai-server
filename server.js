// server.js
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import FormData from "form-data";
import cors from "cors";

const app = express();
app.use(cors());

const upload = multer({ dest: "uploads/" });

app.get("/", (req, res) => res.send("IELTS AI Assessor running"));

app.post("/api/upload-audio", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY not set");

    const audioPath = req.file.path;
    const fileStream = fs.createReadStream(audioPath);

    // Send to OpenAI Whisper (audio transcription)
    const form = new FormData();
    form.append("file", fileStream);
    form.append("model", "whisper-1");

    const whisperResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`
      },
      body: form
    });

    if (!whisperResp.ok) {
      const text = await whisperResp.text();
      console.error("Whisper error:", text);
      throw new Error("Transcription failed");
    }
    const whisperJson = await whisperResp.json();
    const transcript = whisperJson.text || "";

    // Evaluate using OpenAI chat/completions
    const prompt = getEvaluationPrompt(transcript);
    const chatResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an experienced IELTS examiner. Be concise and numeric when scoring." },
          { role: "user", content: prompt }
        ],
        max_tokens: 400,
        temperature: 0.2
      })
    });

    if (!chatResp.ok) {
      const t = await chatResp.text();
      console.error("Chat error:", t);
      throw new Error("Evaluation failed");
    }
    const chatJson = await chatResp.json();
    const evalText = chatJson.choices?.[0]?.message?.content || "No feedback returned";

    // If ElevenLabs keys are provided, produce TTS
    const ELEVEN_KEY = process.env.ELEVEN_API_KEY;
    const ELEVEN_VOICE_ID = process.env.ELEVEN_VOICE_ID;
    if (!ELEVEN_KEY || !ELEVEN_VOICE_ID) {
      // cleanup
      fs.unlinkSync(audioPath);
      return res.json({ transcript, feedback: evalText, audioUrl: null });
    }

    const ttsResp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVEN_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: evalText,
        voice_settings: { stability: 0.4, similarity_boost: 0.2 }
      })
    });

    if (!ttsResp.ok) {
      const t = await ttsResp.text();
      console.error("TTS error:", t);
      fs.unlinkSync(audioPath);
      return res.json({ transcript, feedback: evalText, audioUrl: null });
    }

    const audioBuffer = Buffer.from(await ttsResp.arrayBuffer());
    const outFileName = `public/feedback-${Date.now()}.mp3`;
    fs.mkdirSync(path.dirname(outFileName), { recursive: true });
    fs.writeFileSync(outFileName, audioBuffer);

    // remove uploaded audio
    fs.unlinkSync(audioPath);

    const audioUrl = `/${outFileName}`;
    return res.json({ transcript, feedback: evalText, audioUrl });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

function getEvaluationPrompt(transcript) {
  return `
Evaluate the following spoken response for IELTS speaking on these five criteria:
1) Fluency & Coherence
2) Lexical Resource
3) Grammatical Range & Accuracy
4) Pronunciation
5) Overall band score

Provide:
- For each criterion, a numeric score on a 1-9 scale and a one-sentence justification.
- An overall band score (1-9).
- Two concrete, short improvement tips targeted to the candidate.

Transcript:
"""${transcript}"""
Respond in JSON with keys: fluency, lexical, grammar, pronunciation, overall, tips, summary

Example:
{
 "fluency": {"score":7, "note":"..."},
 "lexical": {"score":6, "note":"..."},
 "grammar": {"score":6, "note":"..."},
 "pronunciation": {"score":6, "note":"..."},
 "overall": 6,
 "tips": ["tip1","tip2"],
 "summary": "short summary here"
}
Be concise and return only JSON.
`;
}

app.use(express.static("public"));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Server running on port ${port}`));
