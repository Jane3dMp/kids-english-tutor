import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const sessionState = new Map();
const TOPICS = ["family", "school", "friends", "home"];

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

function getNextTopicIndex(idx) {
  if (typeof idx !== "number") return 0;
  return (idx + 1) % TOPICS.length;
}

function enforceMaxFiveWords(text) {
  if (!text) return "";
  const words = text.trim().split(/\s+/);
  if (words.length <= 5) return text.trim();
  return words.slice(0, 5).join(" ");
}

const SYSTEM_PROMPT = `
You are a very patient English tutor for A0 Russian-speaking kids aged 6-8.
Ask one very short question in English (<= 5 words).
Use very simple words. Friendly tone.
Topics: family, school, friends, home. Stay on topic unless child changes it.
If child's answer is unclear, re-ask gently or give a 1-sentence hint (still <= 5 words).
Never use long sentences.
`;

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = await readJsonBody(req);
    const { childText = "", sessionId } = body || {};
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });

    let state = sessionState.get(sessionId);
    if (!state) {
      state = { topicIndex: 0, turns: 0 };
      sessionState.set(sessionId, state);
    }

    if (childText && state.turns > 0 && state.turns % 2 === 0) {
      state.topicIndex = getNextTopicIndex(state.topicIndex);
    }
    const topic = TOPICS[state.topicIndex];

    const userInstruction = childText
      ? `Child said: "${childText}". Ask next tiny question on topic: ${topic}.`
      : `Start conversation with a tiny question on topic: ${topic}.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userInstruction }
      ]
    });

    let tutorText = completion.choices?.[0]?.message?.content || "Hi! Your name?";
    tutorText = enforceMaxFiveWords(tutorText);

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: tutorText
    });

    const arrayBuf = await speech.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuf).toString("base64");

    state.turns += 1;
    sessionState.set(sessionId, state);

    return res.status(200).json({
      tutorText,
      ttsAudioBase64: audioBase64,
      audioMimeType: "audio/mpeg",
      sessionId
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Tutor failed" });
  }
}
