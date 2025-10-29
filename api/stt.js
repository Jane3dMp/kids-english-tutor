import OpenAI from "openai";
import { toFile } from "openai/uploads";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = await readJsonBody(req);
    const { audioBase64, mimeType } = body || {};
    if (!audioBase64 || !mimeType) {
      return res.status(400).json({ error: "audioBase64 and mimeType required" });
    }

    const buffer = Buffer.from(audioBase64, "base64");
    const ext = mimeType.includes("webm") ? "webm" : (mimeType.includes("ogg") ? "ogg" : "mp3");
    const file = await toFile(buffer, `audio.${ext}`, { type: mimeType });

    const result = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1"
    });

    return res.status(200).json({ text: result.text || "" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "STT failed" });
  }
}
