# ruytha-site

One page. Plain HTML, CSS and JavaScript. No build step, no framework, no npm install.

```
index.html              the whole page
vercel.json             Vercel settings
api/lastfm.js           serverless function that talks to Last.fm
assets/styles.css       all styling
assets/main.js          all behaviour
assets/config.js        optional offline fallback (usually leave empty)
assets/img/             pictures — see IMAGES.md
```

---

## 1. Get a Last.fm API key

1. Go to https://www.last.fm/api/account/create
2. Application name: anything (`ruytha site` is fine). Leave the callback URL blank.
3. Copy the **API key** it gives you. Ignore the shared secret — this site doesn't need it.

## 2. Deploy

Drag the folder onto https://vercel.com/new, or:

```bash
npm i -g vercel
cd ruytha-site
vercel
```

Framework preset: **Other**. No build command, no output directory.

## 3. Add your Last.fm details

Vercel dashboard → your project → **Settings** → **Environment Variables**:

| Name | Value |
| --- | --- |
| `LASTFM_API_KEY` | the key from step 1 |
| `LASTFM_USER` | your Last.fm username |

Then **Deployments → ⋯ → Redeploy**. Environment variables only apply to builds made
after you add them, so the redeploy is not optional.

The music section fills itself in from there. Your key stays on the server — it's never
sent to the browser.

## 4. Point your domain at it

Project → **Settings** → **Domains** → add your domain. Vercel shows you the exact
records to paste into Porkbun's DNS page.

---

## Running it locally

Opening `index.html` by double-clicking works — the page renders fully. The one thing
that won't work is the music section, because there's no server to run `/api/lastfm`,
so it shows a short note explaining that instead.

To get everything working locally, either:

```bash
vercel dev          # runs the API function too
```

or, quick and dirty, put your username and key into `assets/config.js`. **Blank that file
out again before you push** — anything in it is readable by anyone who views the source.

---

## Changing things

**Text** — all of it is in `index.html`, in plain sentences. Edit and save.

**Colours** — top of `assets/styles.css`, in the `:root` block:

```css
--a1: #32ade6;   /* cyan   */
--a2: #af52de;   /* purple */
--a3: #ff2d55;   /* pink   */
```

Change those three and the hero light pool, icons, badges and links all follow.

**Number of tracks shown** — `var LIMIT = 8;` near the top of the Last.fm section in
`assets/main.js`.

**Light and dark** — the button in the top right. It remembers your choice, and defaults
to whatever your system is set to.

---

## Easter eggs

Type `miku`, `teto` or `forza` anywhere on the page.
