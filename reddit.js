export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { sub, sort = "hot" } = req.query;

  if (!sub || !/^[a-zA-Z0-9_]{1,50}$/.test(sub)) {
    return res.status(400).json({ error: "Invalid subreddit name" });
  }

  const validSorts = ["hot", "new", "top"];
  const safeSort = validSorts.includes(sort) ? sort : "hot";

  try {
    const url = `https://www.reddit.com/r/${sub}/${safeSort}/.rss?limit=50`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (response.status === 404 || response.status === 403) {
      return res.status(404).json({ error: "Subreddit not found or private" });
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: "Reddit unavailable" });
    }

    const xml = await response.text();

    // Set cache headers so same subreddit doesn't re-fetch for 10 mins
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=300");
    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(xml);

  } catch (err) {
    console.error("Reddit proxy error:", err.message);
    return res.status(502).json({ error: "Failed to fetch from Reddit" });
  }
}
