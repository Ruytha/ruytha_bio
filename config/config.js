// ============================================================================
// config.js — PUBLIC, non-secret config only. This file is loaded in the
// browser, so anything in here is visible to anyone who views source.
//
// Real secrets (Last.fm API key, etc.) live in environment variables instead:
//   - locally:  copy .env.example to .env, fill it in
//   - on Vercel: Project → Settings → Environment Variables
// They're read server-side in /api/lastfm.js and never shipped to the client.
// ============================================================================

window.RUYTHA_CONFIG = {
  siteTitle: 'ruytha',
  lastfmUsername: 'ruytha', // display-only fallback if the API route is unreachable
  socials: {
    spotify: 'https://open.spotify.com/user/31wqsddt5oxby3p4ta7rx52mt6nu',
    discord: 'https://discord.com/users/690508522395402260',
    discordServer: 'https://discord.gg/m9veFRXxDF',
    blog: 'https://ruytha.blogspot.com',
    spicyLyrics: 'https://spicylyrics.org/ruytha',
  },
};
