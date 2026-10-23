/**
 * GET /api/motion-cover?artist=The%20Weeknd&album=After%20Hours[&upc=00602508939602][&country=gb]
 *   -> 200 video/webm   the album's Apple Music animated cover (square), as VP8 WebM
 *   -> 404 { found: false }   no animated cover, or the album isn't on Apple Music
 *   -> 403 / 429   not from Spotify, or too many new conversions
 * Add &check=1 for a quick { found: true|false } without converting anything, so the
 * player knows whether to show a loading state.
 *
 * The album is found by its barcode (upc) when given, which is exact, then by name.
 * `country` is the listener's store; the US store is tried after it.
 *
 * For Spicy Lyrics: Ruytha Edition. Spotify's player can't read Apple's pages (no CORS)
 * and can't decode Apple's video (H.264/HEVC only), so this finds the cover on
 * music.apple.com and converts it to WebM, which it can play.
 *
 * Every answer is cached at Vercel's edge, so each album is converted once for everyone.
 * Only uncached requests reach this code. A request must come from Spotify's player, and
 * each IP gets RATE_PER_IP conversions an hour (all IPs together, RATE_TOTAL); checks
 * and albums without a cover don't count. The counters live in the same Upstash Redis as
 * /api/stats; without it the limits are skipped.
 * Needs ffmpeg-static (in package.json; vercel.json bundles its binary and allows 60 s).
 * FFMPEG_PATH overrides the binary for local testing.
 */

const { spawn } = require('node:child_process');
const { mkdtemp, writeFile, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

// Vercel caps a function's response at 4.5 MB; the bitrate is picked to stay under this.
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_BITRATE = 1600 * 1000;
// Apple's renditions go up to 1080x1080; the cover shows at about 500px.
const MAX_SIDE = 768;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const ONE_YEAR = 31536000;
const ONE_DAY = 86400;

const ALLOWED_ORIGIN = 'https://xpui.app.spotify.com';
const RATE_PER_IP = 30;
const RATE_TOTAL = 600;
const RATE_WINDOW_S = 3600;

module.exports = async function handler(req, res) {
  res.setHeader('access-control-allow-origin', ALLOWED_ORIGIN);
  res.setHeader('vary', 'origin');
  // Refusals are never cached, or a refusal would be served to Spotify too.
  if (req.headers.origin !== ALLOWED_ORIGIN) {
    res.setHeader('cache-control', 'no-store');
    res.status(403).json({ error: 'forbidden', message: 'Only Spicy Lyrics: Ruytha Edition can use this.' });
    return;
  }

  const artist = clean(req.query.artist);
  const album = clean(req.query.album);
  const upc = /^\d{8,14}$/.test(String(req.query.upc || '')) ? String(req.query.upc) : null;
  const country = /^[a-z]{2}$/i.test(String(req.query.country || '')) ? String(req.query.country).toLowerCase() : 'us';
  if (!artist || !album) {
    res.status(400).json({ error: 'artist and album are required' });
    return;
  }

  try {
    const page = await findAlbumPage(artist, album, upc, country);
    const master = page && (await findMotionPlaylist(page));
    if (req.query.check) {
      // Albums rarely gain an animated cover; ask again tomorrow.
      res.setHeader('cache-control', `public, s-maxage=${ONE_DAY}`);
      res.status(200).json({ found: !!master });
      return;
    }
    if (!master) {
      res.setHeader('cache-control', `public, s-maxage=${ONE_DAY}`);
      res.status(404).json({ found: false });
      return;
    }

    if (await overLimit(clientIp(req))) {
      res.setHeader('cache-control', 'no-store');
      res.setHeader('retry-after', String(RATE_WINDOW_S));
      res.status(429).json({ error: 'rate_limited' });
      return;
    }

    const webm = await convert(await downloadVideo(master));
    res.setHeader('content-type', 'video/webm');
    res.setHeader('cache-control', `public, max-age=${ONE_DAY}, s-maxage=${ONE_YEAR}, immutable`);
    res.status(200).send(webm);
  } catch (err) {
    // Not cached: Apple or ffmpeg hiccups shouldn't stick.
    res.setHeader('cache-control', 'no-store');
    res.status(502).json({ error: 'failed', message: String(err && err.message || err) });
  }
};

function clean(value) {
  return String(value || '').trim().slice(0, 200);
}

/** Lowercase, without "(Deluxe)", "- Single" and the like, punctuation or spaces. */
function normalize(name) {
  return name
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]\s*/g, ' ')
    .replace(/\s+-\s+(single|ep)$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** The album's music.apple.com URL: by barcode first, then by name, in each store. */
async function findAlbumPage(artist, album, upc, country) {
  const stores = country === 'us' ? ['us'] : [country, 'us'];
  for (const store of stores) {
    if (upc) {
      const byUpc = await itunes(`https://itunes.apple.com/lookup?entity=album&country=${store}&upc=${upc}`);
      const hit = byUpc.find((r) => r.collectionViewUrl);
      if (hit) return hit.collectionViewUrl.replace(/\?.*$/, '');
    }
    const byName = await itunes(
      `https://itunes.apple.com/search?entity=album&limit=25&country=${store}&term=` +
        encodeURIComponent(`${artist} ${album}`)
    );
    const hit = bestByName(byName, artist, album);
    if (hit) return hit.collectionViewUrl.replace(/\?.*$/, '');
  }
  return null;
}

async function itunes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`iTunes ${res.status}`);
  const { results = [] } = await res.json();
  return results;
}

function bestByName(results, artist, album) {
  const wantArtist = normalize(artist);
  const wantAlbum = normalize(album);
  const exact = (r) => r.collectionName.toLowerCase() === album.toLowerCase();
  const sameArtist = (r) => normalize(r.artistName).includes(wantArtist) || wantArtist.includes(normalize(r.artistName));
  const candidates = results.filter((r) => r.collectionViewUrl && sameArtist(r) && normalize(r.collectionName) === wantAlbum);
  return candidates.find(exact) || candidates[0] || null;
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip'] || 'unknown');
}

/** Counts this conversion; true once the IP or everyone together is over the hour's limit. */
async function overLimit(ip) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  const hour = Math.floor(Date.now() / 1000 / RATE_WINDOW_S);
  const ipKey = `motion:ip:${ip}:${hour}`;
  const totalKey = `motion:total:${hour}`;
  try {
    const upstream = await fetch(url.replace(/\/$/, '') + '/pipeline', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify([
        ['INCR', ipKey],
        ['EXPIRE', ipKey, RATE_WINDOW_S],
        ['INCR', totalKey],
        ['EXPIRE', totalKey, RATE_WINDOW_S],
      ]),
    });
    if (!upstream.ok) return false;
    const results = await upstream.json();
    return results[0].result > RATE_PER_IP || results[2].result > RATE_TOTAL;
  } catch {
    // Redis down: let it through rather than break covers for everyone.
    return false;
  }
}

/** The master playlist of the album's square animated cover, or null. */
async function findMotionPlaylist(pageUrl) {
  const res = await fetch(pageUrl, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`Apple Music page ${res.status}`);
  const html = (await res.text()).replace(/\\u002F/g, '/');
  const match = html.match(/"motionDetailSquare":\{.*?"video":"(https:[^"]+?\.m3u8)"/s);
  return match ? match[1] : null;
}

/** Downloads the H.264 rendition closest to MAX_SIDE as one fragmented MP4. */
async function downloadVideo(masterUrl) {
  const master = await text(masterUrl);
  const variants = [];
  const lines = master.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    const codecs = /CODECS="([^"]+)"/.exec(line);
    const size = /RESOLUTION=(\d+)x(\d+)/.exec(line);
    const bandwidth = /[^-]BANDWIDTH=(\d+)/.exec(line);
    if (!codecs || !codecs[1].startsWith('avc1') || !size) continue;
    variants.push({
      side: Number(size[1]),
      bandwidth: bandwidth ? Number(bandwidth[1]) : 0,
      url: new URL(lines[i + 1].trim(), masterUrl).href,
    });
  }
  const fitting = variants.filter((v) => v.side <= MAX_SIDE);
  const pick = (fitting.length ? fitting : variants).sort((a, b) => b.side - a.side || b.bandwidth - a.bandwidth)[0];
  if (!pick) throw new Error('No H.264 rendition');

  // The media playlist is an init section plus segments, usually byte ranges of one file.
  const media = await text(pick.url);
  const files = [];
  for (const line of media.split('\n')) {
    const map = /^#EXT-X-MAP:URI="([^"]+)"/.exec(line);
    const uri = map ? map[1] : !line.startsWith('#') && line.trim() ? line.trim() : null;
    if (!uri) continue;
    const href = new URL(uri, pick.url).href;
    if (!files.includes(href)) files.push(href);
  }
  const parts = await Promise.all(files.map(async (href) => {
    const res = await fetch(href);
    if (!res.ok) throw new Error(`Segment ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }));
  const durationS = media
    .split('\n')
    .filter((l) => l.startsWith('#EXTINF:'))
    .reduce((sum, l) => sum + parseFloat(l.slice(8)), 0);
  return { mp4: Buffer.concat(parts), durationS: durationS || 20 };
}

async function text(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.text();
}

function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  return require('ffmpeg-static');
}

/** H.264 MP4 -> VP8 WebM, sized to fit the response limit. */
async function convert({ mp4, durationS }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'motion-'));
  const input = path.join(dir, 'in.mp4');
  const output = path.join(dir, 'out.webm');
  try {
    await writeFile(input, mp4);
    const bitrate = Math.min(MAX_BITRATE, Math.floor((MAX_BYTES * 8 * 0.9) / durationS));
    await run(ffmpegPath(), [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', input,
      '-an',
      '-c:v', 'libvpx',
      '-b:v', String(bitrate), '-maxrate', String(bitrate), '-bufsize', String(bitrate * 2),
      '-deadline', 'realtime', '-cpu-used', '5',
      '-auto-alt-ref', '0',
      '-f', 'webm', output,
    ]);
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${stderr.slice(-300)}`))));
  });
}
