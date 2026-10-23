/**
 * GET /api/motion-cover?artist=The%20Weeknd&album=After%20Hours
 *   -> 200 video/webm   the album's Apple Music animated cover (square), as VP8 WebM
 *   -> 404 { found: false }   no animated cover, or the album isn't on Apple Music
 *
 * For Spicy Lyrics: Ruytha Edition. Spotify's player can't read Apple's pages (no CORS)
 * and can't decode Apple's video (H.264/HEVC only), so this finds the cover on
 * music.apple.com and converts it to WebM, which it can play.
 *
 * Every answer is cached at Vercel's edge, so each album is converted once for everyone.
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

module.exports = async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  const artist = clean(req.query.artist);
  const album = clean(req.query.album);
  if (!artist || !album) {
    res.status(400).json({ error: 'artist and album are required' });
    return;
  }

  try {
    const page = await findAlbumPage(artist, album);
    const master = page && (await findMotionPlaylist(page));
    if (!master) {
      // Albums rarely gain an animated cover; check again tomorrow.
      res.setHeader('cache-control', `public, s-maxage=${ONE_DAY}`);
      res.status(404).json({ found: false });
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

/** The album's music.apple.com URL, via the iTunes Search API. */
async function findAlbumPage(artist, album) {
  const url =
    'https://itunes.apple.com/search?entity=album&limit=25&country=us&term=' +
    encodeURIComponent(`${artist} ${album}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`iTunes search ${res.status}`);
  const { results = [] } = await res.json();

  const wantArtist = normalize(artist);
  const wantAlbum = normalize(album);
  const exact = (r) => r.collectionName.toLowerCase() === album.toLowerCase();
  const sameArtist = (r) => normalize(r.artistName).includes(wantArtist) || wantArtist.includes(normalize(r.artistName));
  const candidates = results.filter((r) => r.collectionViewUrl && sameArtist(r) && normalize(r.collectionName) === wantAlbum);
  const best = candidates.find(exact) || candidates[0];
  return best ? best.collectionViewUrl.replace(/\?.*$/, '') : null;
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
