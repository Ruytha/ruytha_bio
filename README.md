# ruytha.vercel.app

Your bio site: Home, Projects, Contact, a live Last.fm widget, an Apple-Music-lyrics-style
ambient background, RuythaCloud (Clerk-gated private uploads), and a Minecraft button that
opens your Eaglercraft build.

## 1. Install

```bash
npm install
```

## 2. Environment variables

Copy `.env.example` to `.env.local` if you're starting fresh — but a `.env.local` is already
included here with your Clerk + Last.fm keys filled in. Two things you still need to add:

- `CLOUD_WHITELIST_EMAILS` — comma-separated, no spaces, e.g. `you@gmail.com,friend@gmail.com`.
  Must match the email each person actually signs into Clerk with.
- `BLOB_READ_WRITE_TOKEN` — see step 4 below.

**Security note:** your Clerk secret key was shared in plain chat text to build this. Rotate it
before this goes live — Clerk dashboard → your app → **API Keys** → regenerate the secret key —
then update `.env.local` and your Vercel project's env vars with the new one.

## 3. Clerk setup walkthrough

You already have a Clerk app (the keys you gave me are already wired in), so this is mostly
about getting sign-in working end to end:

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com) and open your app (the one whose
   keys start with `pk_test_aGVscGVkLXF1YWdnYS0zNC5jbGVyay5hY2NvdW50cy5kZXYk`).
2. Under **Configure → Email, Phone, Username**, make sure "Email address" is enabled as an
   identifier — that's what the whitelist checks against.
3. Under **Configure → Restrictions**, you can optionally also restrict sign-*ups* at the Clerk
   level (allowlist by email) as a second layer on top of the app's own whitelist check. Not
   required — the app already blocks uploads for anyone not in `CLOUD_WHITELIST_EMAILS` — but
   it stops randoms from creating accounts at all if you want that.
4. That's it for dev. Test keys (`pk_test_...` / `sk_test_...`) work fine on localhost and on
   Vercel preview/production deployments too, so you don't need to switch to live keys unless
   you want Clerk's production features (custom domains for auth emails, etc).
5. Once deployed, visit `/cloud`, sign in, and confirm you land on the "not whitelisted" screen
   if your email isn't in the list yet — then add it and refresh to confirm access unlocks.

## 4. Vercel Blob (private store)

1. Push this project to a GitHub repo and import it into Vercel (or run `vercel` from this
   folder).
2. In the Vercel dashboard: your project → **Storage** tab → **Create Database** → **Blob** →
   choose **Private**.
3. Connect it to this project. Vercel will offer to add `BLOB_READ_WRITE_TOKEN` to your
   project's environment variables automatically — accept that.
4. Pull it down locally too, so the sync script can use it:
   ```bash
   vercel env pull .env.local
   ```
   (This overwrites `.env.local` with everything from Vercel, so re-check your other values are
   still there afterward.)

## 5. Last.fm

Already wired up with your API key and username (`Ruytha`). Nothing else to do — the widget
polls `user.getrecenttracks` every 20 seconds.

## 6. Run locally

```bash
npm run dev
```

Visit `http://localhost:3000`.

## 7. Deploy

```bash
vercel deploy --prod
```

or connect the GitHub repo in the Vercel dashboard for auto-deploys on push. This project is
plain Next.js on the App Router with serverless API routes — all free-tier compatible. The one
thing to double check on a fresh Vercel account: Hobby plan function execution time and the
100MB uncompressed function size limit — neither is an issue here since uploads bypass functions
entirely (see below) and the Minecraft file is served as a static asset, not through a function.

## 8. The Minecraft button

`public/minecraft.html` is your Eaglercraft build, copied in as-is. The bottom-bar "Minecraft"
button just links straight to `/minecraft.html` in a new tab — it's a static file, so Vercel
serves it directly with no function involved and no size limit to worry about.

## 9. RuythaCloud sync script — getting files onto your actual PC

This is the other half of RuythaCloud. The website uploads files straight to the private Blob
store from the browser (bypassing Vercel's 4.5MB function body limit entirely). To get them onto
your PC, run:

```bash
BLOB_READ_WRITE_TOKEN=your_token node scripts/sync-cloud.js
# or, with it already in your env / .env.local:
npm run sync-cloud
```

It polls every 15 seconds and copies any new file into `~/RuythaCloud` (override with
`RUYTHACLOUD_DEST=/some/other/path`). Leave it running in a terminal, or set it up as a
background service (Task Scheduler on Windows, `launchd`/cron on macOS, systemd on Linux) if you
want it always on.

## Design notes

- Ambient background = three huge blurred color fields drifting slowly (Apple Music lyrics-view
  style), gently hue-shifted based on whatever's currently playing on Last.fm.
- Motion follows the fluid-interface rules you provided: press feedback fires on pointer-down,
  interactive elements use critically-damped springs (no gratuitous bounce), the mobile nav
  slides out the same way it slides in, and everything respects `prefers-reduced-motion` /
  `prefers-reduced-transparency`.
- Easter eggs: try the Konami code (↑↑↓↓←→←→ b a), or just type "femboy" or "idot" anywhere on
  the page.
