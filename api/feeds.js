export default async function handler(req, res) {
  const channelId = (req.query.channelId || process.env.THINGSPEAK_CHANNEL_ID || "3281642").trim();
  const readApiKey = (req.query.readApiKey || process.env.THINGSPEAK_READ_API_KEY || "").trim();
  const results = Math.min(Math.max(Number(req.query.results || 30), 1), 200);

  const authorizedKey = process.env.THINGSPEAK_READ_API_KEY;
  const authorizedChannelId = process.env.THINGSPEAK_CHANNEL_ID;

  if (authorizedKey && readApiKey !== authorizedKey) {
    return res.status(401).json({ ok: false, error: "Authentication failed." });
  }
  if (authorizedChannelId && channelId !== authorizedChannelId) {
    return res.status(401).json({ ok: false, error: "Authentication failed." });
  }

  try {
    const base = `https://api.thingspeak.com/channels/${encodeURIComponent(channelId)}/feeds.json?results=${results}`;
    const url = readApiKey ? `${base}&api_key=${encodeURIComponent(readApiKey)}` : base;

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ ok: false, error: "ThingSpeak request failed" });
    }

    const payload = await response.json();
    return res.json({ ok: true, channelId, feeds: payload.feeds || [] });
  } catch {
    return res.status(500).json({ ok: false, error: "Failed to fetch ThingSpeak data" });
  }
}
