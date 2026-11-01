// Vercel serverless function: lets the Study Book page use Claude without exposing your API key.
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   ANTHROPIC_API_KEY  (required)  your key from console.anthropic.com
//   APP_PASSCODE       (optional)  if set, the page asks for this passcode before using Claude
//   CLAUDE_MODEL       (optional)  defaults to claude-sonnet-5-5

module.exports = async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;

  // The page calls GET first to see whether Claude is set up.
  if (req.method === "GET") {
    return res.status(200).json({ ok: !!key });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!key) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
  }

  const pass = process.env.APP_PASSCODE;
  if (pass && req.headers["x-passcode"] !== pass) {
    return res.status(401).json({ error: "Wrong passcode" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const prompt = String(body.prompt || "").slice(0, 40000);
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  const content = [];
  if (body.image && body.image.data) {
    const type = /^image\/(jpeg|png|gif|webp)$/.test(body.image.media_type) ? body.image.media_type : "image/jpeg";
    content.push({ type: "image", source: { type: "base64", media_type: type, data: body.image.data } });
  }
  content.push({ type: "text", text: prompt });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
        max_tokens: 8000,
        messages: [{ role: "user", content }],
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: (data.error && data.error.message) || "Claude API error" });
    }
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: "Could not reach Claude" });
  }
};
