// api/laoshi.js
// ---------------------------------------------------------------------------
// This is a serverless function (deploy on Vercel, Netlify Functions, or
// similar free hosting). It is the "middleman" that keeps your API keys
// private — the app in the browser NEVER holds these keys directly.
//
// Flow: try Gemini first (best quality, free). If Gemini fails or its daily
// quota is used up, automatically fall back to Groq (also free).
//
// SETUP:
// 1. Get a free Gemini key at https://aistudio.google.com  (no credit card)
// 2. Get a free Groq key at https://console.groq.com        (no credit card)
// 3. On your hosting platform (e.g. Vercel), add these as Environment
//    Variables — NEVER paste them directly into this file:
//      GEMINI_API_KEY = your gemini key
//      GROQ_API_KEY   = your groq key
// ---------------------------------------------------------------------------

const LAO_SHI_SYSTEM_PROMPT = `You are Lao Shi (老师), a warm, patient, encouraging AI Chinese teacher inside the Ni Hao app.
If this is the start of a new conversation (no prior messages), greet the user warmly and ask for their name before teaching anything.
Once given a name, give a phonetic Chinese transliteration of it (characters chosen for pleasant meaning where possible, plus pinyin), briefly explain what the characters mean, and say clearly this is a fun phonetic approximation, not a literal translation.
You help complete beginners learn Mandarin Chinese: vocabulary, pinyin, tones, grammar, and basic conversation.
You also teach real Chinese culture: festivals, customs, food, history, philosophy — accurately, and you say clearly when you're not fully sure of something rather than guessing.
Keep responses short and easy to read on a phone screen (2-5 sentences, unless the user asks for more detail).
When teaching a word, always give: the Chinese characters, pinyin with tone marks, and the English meaning.
Be encouraging. Never make a beginner feel bad for a mistake — correct gently and explain why.
Never invent facts about Chinese history or culture. If unsure, say so.`;

async function callGemini(userMessage, apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: LAO_SHI_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no text");
  return text;
}

async function callGroq(userMessage, apiKey) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: LAO_SHI_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned no text");
  return text;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { message } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Missing 'message' in request body" });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  // Try Gemini first
  if (geminiKey) {
    try {
      const text = await callGemini(message, geminiKey);
      return res.status(200).json({ reply: text, engine: "gemini" });
    } catch (err) {
      console.error("Gemini failed, falling back to Groq:", err.message);
    }
  }

  // Fall back to Groq
  if (groqKey) {
    try {
      const text = await callGroq(message, groqKey);
      return res.status(200).json({ reply: text, engine: "groq" });
    } catch (err) {
      console.error("Groq also failed:", err.message);
    }
  }

  // Both failed / no keys configured
  return res.status(503).json({
    error: "Lao Shi is resting right now — both free engines are unavailable. Try again shortly.",
  });
}
