export default function handler(req, res) {
  res.json({
    ok: true,
    channelId: process.env.THINGSPEAK_CHANNEL_ID || "3281642",
    hasReadApiKey: Boolean(process.env.THINGSPEAK_READ_API_KEY),
  });
}
