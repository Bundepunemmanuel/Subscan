export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const key = process.env.GROQ_API_KEY || "";
  if (!key) {
    return res.status(404).json({ error: "No API key configured" });
  }
  return res.status(200).json({ key });
}
