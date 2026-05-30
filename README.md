# SubScan

Scan any subreddit and instantly see the 5 biggest customer pain signals from the last 7 days. Free. No login required.

---

## How it works

1. Your browser fetches Reddit posts directly — no server involved
2. Posts are sent to Groq AI for analysis
3. You see 5 pain signals with real Reddit post links

This means it scales to unlimited users simultaneously with zero infrastructure cost.

---

## File Structure

Every file you need to create in your GitHub repo:

```
your-repo/
├── pages/
│   ├── index.js          ← Main page (all logic lives here)
│   ├── _app.js           ← App wrapper
│   ├── 404.js            ← Custom 404 page
│   └── api/
│       └── groq-key.js   ← Secure API key endpoint
├── styles/
│   └── globals.css       ← All styles
├── .env.local.example    ← Copy this to .env.local
├── .gitignore
├── next.config.js
├── package.json
└── README.md
```

---

## Step 1 — Get a free Groq API key

1. Go to [console.groq.com](https://console.groq.com)
2. Sign up for free
3. Click **API Keys** → **Create API Key**
4. Copy the key (starts with `gsk_...`)

---

## Step 2 — Set up your GitHub repo

Create a new public repo on GitHub and upload all the files above maintaining the exact folder structure shown.

**Important:** The folder structure must be exact:
- `pages/index.js` not just `index.js`
- `pages/api/groq-key.js` not just `groq-key.js`
- `styles/globals.css` not just `globals.css`

---

## Step 3 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **Add New Project**
3. Import your GitHub repo
4. Before clicking Deploy, click **Environment Variables**
5. Add:
   - **Name:** `GROQ_API_KEY`
   - **Value:** your key from Step 1 (starts with `gsk_...`)
   - **Environments:** check Production, Preview, and Development
6. Click **Add** then **Deploy**

---

## Step 4 — Add GROQ_API_KEY to existing Vercel project

If already deployed and need to add or update the key:

1. Open your project on [vercel.com/dashboard](https://vercel.com/dashboard)
2. Go to **Settings** → **Environment Variables**
3. Click **Add New**
4. Name: `GROQ_API_KEY` / Value: your Groq key
5. Check all three environments (Production, Preview, Development)
6. Click **Save**
7. Go to **Deployments** → click the three dots on latest → **Redeploy**

---

## Run locally

```bash
# 1. Clone your repo
git clone https://github.com/yourusername/subscan.git
cd subscan

# 2. Install dependencies
npm install

# 3. Create your env file
cp .env.local.example .env.local
# Open .env.local and paste your GROQ_API_KEY

# 4. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Why this architecture works for many users

- Each user's **browser** fetches Reddit directly — Reddit doesn't block normal browsers
- Each user's **browser** calls Groq using YOUR key via the secure `/api/groq-key` endpoint
- No shared queue, no bottleneck — 1000 users scanning at once = 1000 independent browser sessions
- Your Vercel server only serves the HTML/JS files — near zero load

---

## Never commit .env.local

Your `.env.local` file is already in `.gitignore`. Never push it to GitHub. Add the key only through Vercel's dashboard.

---

## Rate limits

- 5 scans per hour per user (tracked in browser localStorage)
- Groq free tier: 30 requests/minute — more than enough for typical traffic
