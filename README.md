# ruytha.dev

Personal site: home / projects / contact, a live "currently listening" section
powered by Last.fm, an animated ambient background inspired by the Apple
Music lyrics renderer (it even retints itself from your current album art),
a few easter eggs, and a footer button that opens `minecraft.html`.

Plain multi-page HTML/CSS/JS — no build step, no framework. Each page is its
own real `.html` file (`index.html`, `projects.html`, `contact.html`), so
navigation is just normal links.

## Structure

```
index.html          Home
projects.html        What I've been up to
contact.html          Contact form (opens your email client)
minecraft.html         The Minecraft button's destination — replace with your real file
404.html                Easter-egg not-found page
css/style.css             All styling + the ambient blob background
js/main.js                  Shared nav + easter eggs, injected on every page
js/lastfm.js                  Fetches /api/lastfm and renders the music section
api/lastfm.js                   Serverless function — the ONLY thing that touches the real Last.fm API key
config/config.js                  Public, non-secret config (socials, display strings)
.env.example                        Template for the real secret values
```

## 1. Swap in your Minecraft file

`minecraft.html` is currently a placeholder — no file actually came through
in the chat that generated this site. Drop your real file in at
`minecraft.html` (same filename) and the footer button on every page will
open it automatically.

## 2. Get a Last.fm API key

1. Go to https://www.last.fm/api/account/create and create an API account (free).
2. You'll get an **API key**. You don't need the shared secret for this.
3. Copy `.env.example` to `.env` and fill in:
   ```
   LASTFM_API_KEY=your_key_here
   LASTFM_USERNAME=your_lastfm_username
   ```

**Never commit `.env`** — it's already in `.gitignore`. The key is only ever
read server-side, inside `api/lastfm.js`; the browser never sees it.

## 3. Run it locally

```bash
npm install -g vercel   # if you don't have it yet
vercel dev
```

This serves the static pages AND runs `api/lastfm.js` as a real serverless
function locally, reading from your `.env`.

## 4. Push to GitHub

```bash
git init
git add .
git commit -m "ruytha.dev"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.env` won't be included — only `.env.example` is tracked, so your API key
never ends up on GitHub.

## 5. Deploy to Vercel

Either connect the GitHub repo in the Vercel dashboard (recommended — auto
deploys on every push), or deploy straight from the CLI:

```bash
vercel            # first time: links the project, deploys a preview
vercel deploy --prod
```

**Then set your environment variables in Vercel itself:** Project → Settings
→ Environment Variables → add `LASTFM_API_KEY` and `LASTFM_USERNAME`. Redeploy
after adding them (`vercel deploy --prod` again) so the function picks them up.

## Easter eggs

- Konami code (`↑ ↑ ↓ ↓ ← → ← → b a`) flips the whole page.
- Click the little dot in the logo 5 times.
- Open the browser console.
