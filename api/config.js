const isValidReadApiKey = (key) => /^[A-Za-z0-9]{16}$/.test(key);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { channelId, readApiKey } = req.body || {};

  if (!channelId || typeof channelId !== "string" || !/^\d+$/.test(channelId.trim())) {
    return res.status(400).json({ ok: false, error: "Channel ID must be numeric." });
  }

  if (!readApiKey || typeof readApiKey !== "string" || !isValidReadApiKey(readApiKey.trim())) {
    return res.status(400).json({
      ok: false,
      error: "Invalid Read API Key. Expected exactly 16 alphanumeric characters.",
    });
  }

  const cleanChannelId = channelId.trim();
  const cleanKey = readApiKey.trim();

  const authorizedKey = process.env.THINGSPEAK_READ_API_KEY;
  const authorizedChannelId = process.env.THINGSPEAK_CHANNEL_ID;

  if (authorizedKey && cleanKey !== authorizedKey) {
    return res.status(401).json({ ok: false, error: "Authentication failed. The Read API Key is incorrect." });
  }
  if (authorizedChannelId && cleanChannelId !== authorizedChannelId) {
    return res.status(401).json({ ok: false, error: "Authentication failed. The Channel ID is incorrect." });
  }

  try {
    const testUrl = `https://api.thingspeak.com/channels/${encodeURIComponent(cleanChannelId)}/feeds.json?results=1&api_key=${encodeURIComponent(cleanKey)}`;
    const tsResponse = await fetch(testUrl);

    if (tsResponse.status === 404) {
      return res.status(400).json({ ok: false, error: "Channel not found. Check your Channel ID." });
    }
    if (!tsResponse.ok) {
      return res.status(400).json({ ok: false, error: `ThingSpeak rejected the request (HTTP ${tsResponse.status}).` });
    }

    let tsData;
    try {
      tsData = await tsResponse.json();
    } catch {
      return res.status(400).json({ ok: false, error: "ThingSpeak returned unreadable data." });
    }

    if (tsData.status === "0" || tsData.error) {
      return res.status(401).json({ ok: false, error: "Authentication failed. Channel ID or Read API Key is incorrect." });
    }

    if (!tsData.channel) {
      return res.status(400).json({ ok: false, error: "Could not verify channel. Check your Channel ID and API Key." });
    }
  } catch {
    return res.status(503).json({ ok: false, error: "Could not reach ThingSpeak to verify credentials. Check your internet connection." });
  }

  return res.json({ ok: true, channelId: cleanChannelId, hasReadApiKey: true });
}
