import { useState, useEffect, useRef } from "react";
import Head from "next/head";

const RATE_LIMIT = 5;
const RATE_WINDOW = 60 * 60 * 1000;
const BASE_COUNT = 247;
const POPULAR = ["SaaS", "indiehackers", "entrepreneur", "solopreneur", "SideProject", "startups", "smallbusiness", "marketing"];

const STEPS = [
  "Fetching posts from r/{sub}...",
  "Reading 50 posts...",
  "Detecting pain signals...",
  "Almost done...",
];

// ── Rate limit helpers ──
function getRl() {
  try {
    const d = JSON.parse(localStorage.getItem("ss_rl") || "{}");
    if (!d.ts || Date.now() - d.ts > RATE_WINDOW) return { count: 0, ts: Date.now() };
    return d;
  } catch { return { count: 0, ts: Date.now() }; }
}
function saveRl(d) { try { localStorage.setItem("ss_rl", JSON.stringify(d)); } catch {} }
function getCount() { try { return parseInt(localStorage.getItem("ss_count") || "0") || 0; } catch { return 0; } }
function bumpCount() { try { const n = getCount() + 1; localStorage.setItem("ss_count", n); return n; } catch { return 0; } }

// ── Parse Reddit Atom feed ──
function parseAtom(xml) {
  const posts = [];
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  for (const m of entries) {
    const entry = m[1];
    const title = (entry.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]
      ?.replace(/<!\[CDATA\[|\]\]>/g, "")?.trim() ?? "";
    const link = (entry.match(/<link[^>]*href="([^"]+)"/) || [])[1]?.trim() ?? "";
    const content = (entry.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1]
      ?.replace(/<!\[CDATA\[|\]\]>/g, "")
      ?.replace(/<[^>]+>/g, " ")
      ?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      ?.replace(/\s+/g, " ").trim().slice(0, 150) ?? "";
    if (!title || !link.includes("/comments/")) continue;
    posts.push({ title, redditUrl: link, selftext: content });
  }
  return posts;
}

// ── Fetch Reddit RSS via our own Next.js API proxy (avoids CORS) ──
async function fetchReddit(sub) {
  for (const sort of ["hot", "new", "top"]) {
    try {
      const res = await fetch(`/api/reddit?sub=${encodeURIComponent(sub)}&sort=${sort}`);
      if (res.status === 404) return { notFound: true };
      if (!res.ok) continue;
      const xml = await res.text();
      if (!xml.includes("<entry>")) continue;
      const posts = parseAtom(xml);
      if (posts.length > 0) return { posts };
    } catch (e) {
      console.warn(`r/${sub}/${sort}:`, e.message);
    }
  }
  return { failed: true };
}

// ── Call Groq directly from browser ──
async function analyzeWithGroq(sub, posts, groqKey) {
  const postsText = posts.slice(0, 25)
    .map((p, i) => `[${i + 1}] Title: ${p.title}\nURL: ${p.redditUrl}\nText: ${p.selftext}`)
    .join("\n\n");

  const prompt = `Read these Reddit posts from r/${sub}. Detect both explicit requests for solutions AND implicit frustrations that signal an unmet need. Extract the 5 most common customer pain signals. For each return: title (short, max 6 words), explanation (one sentence), examples (array of exactly 2 objects each with postTitle and redditUrl). Return ONLY valid JSON array. No markdown. No explanation. Just the JSON.\n\nPosts:\n${postsText}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 1500,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq error ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  let results;
  try { results = JSON.parse(cleaned); }
  catch {
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (m) results = JSON.parse(m[0]);
    else throw new Error("Could not parse AI response");
  }

  if (!Array.isArray(results)) throw new Error("Invalid AI response format");

  return results.slice(0, 5).map((item) => ({
    title: String(item.title || "").slice(0, 80),
    explanation: String(item.explanation || "").slice(0, 300),
    examples: Array.isArray(item.examples)
      ? item.examples.slice(0, 2).map((ex) => ({
          postTitle: String(ex.postTitle || "").slice(0, 200),
          redditUrl: String(ex.redditUrl || `https://reddit.com/r/${sub}`),
        }))
      : [],
  }));
}

export default function Home() {
  const [sub, setSub] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [results, setResults] = useState(null);
  const [scanned, setScanned] = useState("");
  const [error, setError] = useState("");
  const [rateLimited, setRateLimited] = useState(false);
  const [count, setCount] = useState(BASE_COUNT);
  const [groqKey, setGroqKey] = useState("");
  const inputRef = useRef(null);
  const timers = useRef([]);

  useEffect(() => {
    setCount(BASE_COUNT + getCount());
    if (getRl().count >= RATE_LIMIT) setRateLimited(true);
    fetch("/api/groq-key")
      .then((r) => r.json())
      .then((d) => { if (d.key) setGroqKey(d.key); })
      .catch(() => {});
  }, []);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const scan = async (override) => {
    const raw = (override || sub).trim().replace(/^r\//i, "");
    if (!raw) { inputRef.current?.focus(); return; }

    const rl = getRl();
    if (rl.count >= RATE_LIMIT) { setRateLimited(true); return; }
    if (!groqKey) { setError("No Groq API key configured. Please add GROQ_API_KEY in Vercel environment variables."); return; }

    setLoading(true);
    setStep(0);
    setResults(null);
    setError("");
    setScanned(raw.toLowerCase());
    if (!override) setSub(raw);

    clearTimers();
    STEPS.forEach((_, i) => {
      if (i === 0) return;
      timers.current.push(setTimeout(() => setStep(i), i * 900));
    });

    try {
      const reddit = await fetchReddit(raw);
      clearTimers();

      if (reddit.notFound) {
        setError(`r/${raw} doesn't exist or is private. Check the spelling.`);
        setLoading(false);
        return;
      }
      if (reddit.failed || !reddit.posts?.length) {
        setError(`Couldn't load posts from r/${raw}. Please try again.`);
        setLoading(false);
        return;
      }

      setStep(2);
      const analysis = await analyzeWithGroq(raw, reddit.posts, groqKey);
      setStep(3);
      await new Promise((r) => setTimeout(r, 400));

      saveRl({ count: rl.count + 1, ts: rl.ts });
      if (rl.count + 1 >= RATE_LIMIT) setRateLimited(true);
      setCount(BASE_COUNT + bumpCount());
      setResults(analysis);
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      clearTimers();
      setLoading(false);
    }
  };

  const shareUrl = (title) => {
    const text = encodeURIComponent(
      `Found this pain signal in r/${scanned} using SubScan — ${title}\nsubscan-omega.vercel.app #indiehackers #buildinpublic`
    );
    return `https://twitter.com/intent/tweet?text=${text}`;
  };

  return (
    <>
      <Head>
        <title>SubScan — Reddit Customer Pain Signals</title>
        <meta name="description" content="Scan any subreddit and see the 5 biggest customer pain signals from the last 7 days. Free." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%23ad584e'/><text x='16' y='22' font-size='18' text-anchor='middle' fill='white'>⚡</text></svg>" />
      </Head>

      <div className="page">
        <div className="banner">
          Kairo monitors pain signals 24/7 automatically.&nbsp;
          <a href="https://kairo-app.carrd.co" target="_blank" rel="noopener noreferrer">Join the waitlist →</a>
        </div>

        <main className="main">
          <div className="logo-wrap">
            <div className="logo-mark">
              <svg viewBox="0 0 20 20"><path d="M10 1L2 6v8l8 5 8-5V6L10 1zm0 2.18L16 7v6l-6 3.75L4 13V7l6-3.82z"/></svg>
            </div>
            <span className="logo-name">SubScan</span>
          </div>

          <section className="hero">
            <h1 className="headline">Reddit is <em>leaking</em> customer pain signals. Find them before your competitors do.</h1>
            <p className="subheadline">Type any subreddit, see the 5 biggest pain signals from the last 7 days. Free. No login.</p>
            <div className="trust-row">
              <span className="trust-item"><span className="trust-dot"/>Analyzes 50 real Reddit posts</span>
              <span className="trust-item"><span className="trust-dot"/>Detects explicit AND hidden signals</span>
              <span className="trust-item"><span className="trust-dot"/>Built for SaaS founders</span>
            </div>
          </section>

          <div className="chips-row">
            <span className="chips-label">Try:</span>
            {POPULAR.map((s) => (
              <button key={s} className="chip" disabled={loading} onClick={() => { setSub(s); scan(s); }}>
                r/{s}
              </button>
            ))}
          </div>

          <div className="form-row">
            <div className="input-wrap">
              <span className="input-prefix">r/</span>
              <input
                ref={inputRef}
                className="sub-input"
                type="text"
                placeholder="e.g. SaaS, indiehackers, entrepreneur"
                value={sub}
                onChange={(e) => setSub(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && scan()}
                disabled={loading}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button className="scan-btn" onClick={() => scan()} disabled={loading || !sub.trim()}>
              {loading ? "Scanning…" : "Scan →"}
            </button>
          </div>
          <p className="counter"><strong>{count.toLocaleString()}</strong> subreddits scanned by founders</p>

          {rateLimited && (
            <div className="rate-box">
              <p>You've used your 5 free scans for this hour. Kairo does this automatically for 10+ subreddits 24/7.{" "}
                <a href="https://kairo-app.carrd.co" target="_blank" rel="noopener noreferrer">Get early access → kairo-app.carrd.co</a>
              </p>
            </div>
          )}

          {error && !loading && <div className="error-box">⚠️ {error}</div>}

          {loading && (
            <div className="loading-wrap">
              {STEPS.map((s, i) => {
                if (i > step) return null;
                const label = s.replace("{sub}", scanned);
                return (
                  <div key={i} className={`loading-step${i < step ? " done" : ""}`}>
                    {i < step ? <span className="check">✓</span> : <span className="spinner"/>}
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {results && !loading && (
            <>
              <div className="results-top">
                <h2 className="results-heading">Pain signals in r/{scanned}</h2>
                <span className="results-meta">50 posts · last 7 days</span>
              </div>

              <div className="cards">
                {results.map((item, i) => (
                  <div className="card" key={i}>
                    <div className="card-top">
                      <span className="badge">🔍 Hidden frustration in r/{scanned}</span>
                      <a className="x-btn" href={shareUrl(item.title)} target="_blank" rel="noopener noreferrer">
                        <svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        Share
                      </a>
                    </div>
                    <h3 className="card-title"><span className="card-num">#{i + 1}</span>{item.title}</h3>
                    <p className="card-body">{item.explanation}</p>
                    <div className="divider"/>
                    <p className="examples-label">Example posts</p>
                    <div className="examples">
                      {(item.examples || []).map((ex, j) => (
                        <a key={j} className="ex-link" href={ex.redditUrl} target="_blank" rel="noopener noreferrer">
                          <span className="ex-arrow">↗</span>
                          <span>{ex.postTitle}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="cta-box">
                <p className="cta-text">Want Kairo to monitor 10+ subreddits automatically 24/7 and send you the hottest leads every morning?</p>
                <a className="cta-btn" href="https://kairo-app.carrd.co" target="_blank" rel="noopener noreferrer">
                  Become the founder who spots opportunities first →
                </a>
              </div>
            </>
          )}
        </main>

        <footer className="footer">Built for SaaS founders · Powered by Reddit &amp; AI</footer>
      </div>
    </>
  );
}
