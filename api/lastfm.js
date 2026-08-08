// ============================================================================
// /api/lastfm — Vercel serverless function.
// Reads secrets from environment variables (set in the Vercel dashboard, or
// in a local .env file — see .env.example). The API key is NEVER sent to
// the browser: the client only ever calls this same-origin route.
// ============================================================================

export default async function handler(req, res) {
  const apiKey = process.env.LASTFM_API_KEY;
  const username = process.env.LASTFM_USERNAME;

  if (!apiKey || !username) {
    res.status(500).json({
      error: 'Missing LASTFM_API_KEY or LASTFM_USERNAME env vars. See .env.example.',
    });
    return;
  }

  const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(username)}&api_key=${apiKey}&format=json&limit=8`;

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Last.fm upstream error' });
      return;
    }
    const json = await upstream.json();
    const tracks = (json.recenttracks && json.recenttracks.track) || [];
    const list = Array.isArray(tracks) ? tracks : [tracks];

    const mapped = list.map((t) => ({
      name: t.name,
      artist: t.artist && (t.artist['#text'] || t.artist.name),
      image: pickImage(t.image),
      nowPlaying: !!(t['@attr'] && t['@attr'].nowplaying === 'true'),
      when: t.date ? relativeTime(parseInt(t.date.uts, 10) * 1000) : null,
    }));

    const nowPlaying = mapped.find((t) => t.nowPlaying) || null;
    const recent = mapped.filter((t) => !t.nowPlaying).slice(0, 6);

    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=40');
    res.status(200).json({ nowPlaying, recent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reach Last.fm', detail: String(err) });
  }
}

function pickImage(imageArr) {
  if (!Array.isArray(imageArr) || imageArr.length === 0) return null;
  const large = imageArr.find((i) => i.size === 'extralarge') || imageArr[imageArr.length - 1];
  return (large && large['#text']) || null;
}

function relativeTime(ms) {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}
