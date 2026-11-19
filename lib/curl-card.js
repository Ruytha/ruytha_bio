/**
 * What `curl https://ruytha.dev` shows: a little card for the terminal.
 *
 * Served by api/lastfm.js (?view=card), which vercel.json sends "/" to when the request comes from curl, wget, HTTPie or xh;
 * browsers still get the normal page. It shares the Last.fm function because the Hobby plan
 * allows only 12 functions.  My name in big gradient letters, my avatar drawn
 * in coloured half-blocks, what I'm listening to (live from Last.fm), my time, and links.
 *
 *   ?plain   no colours (for terminals that don't do 24-bit colour, or for piping)
 */

// my avatar, 26x26 pixels, as rrggbb hex (made from assets/img/avatar-720.jpg)
const AVATAR = '8a8975676959484e49474c493e46403f4b3d445342455340424e4137423939483c36463a33413428373026322a29362f1e2b291f2c281e2c281e2b24243127445042acb3ac69707596a2adb1bbc7555d4fa2a191595d534850484b58474a59434a5c4545564147553d3341362f3f332a372e212f2927372f2c3c3329382f253229202d25202c25202d242a372a717969a3a799505952a0adb5b3bcc75a6451626b564b524949554a44534337473a394a3b394a3c384837374736303c303541342532292632282b392c2a382d2c3b2e283629232f2334402f475347525e5657635b434e4fa3afbbb2bbc24c5a4660694c686c583b454136443a3644382f3f3527383027372c3b4a372d382d222e2b2b3930222e262b3625212e242433262430253440303a443847524a424c4c495454455053a2aebab1b8bb3f4e423f4a3c3d483e323b39313f393240372f3d342b3a3b31414c3a4a5a3a496037455c3b49552a373c24312b232f241e27202e3a294c533f6d6e636f71706a7174657076646d6ea2aebaaeb1b539483b3c4a3b3442392e36352c3634303d3d4150633c4c6d35456e3040682e3e682d3e6832426c34446b3444612938431c28232935274e553f988f8883878d747a8458606c6d757da3afbda4aaac3a48372d392d3846382d3431343d4045546f2f3f652939622939632a39642a3964283963293a662a3b672b3c6830416b2d3c5324312e3c4339a5958b98918d8e8d91908d8b868783a4b0bc9da3a52c3a312b3a322b372f384143404d6c2e3d6627386026375e26375e2838632838622837622738632838652939672a3b672b3b66283752343f40867f759d90888d86847d7977727672a3afbb989c9d25322e26332f283432404f68293a6428376127366127366025365d2638602637622537632232572130572637632838652839662a3b662f4065565f7174757d616a70535d60707e859facb5929593202b251e28262b39452e3d6525355f26355f25345e25345f24345d23345b2435602637642535601f2c4a4247613f48672c3b65283762283965293a642b3d683245713d4f737383949eaab591928f1a231f1c262331405b27366124345e24345e24345f23335d202f5421325a21335d2435622637652b3a6273676c927b785e5f7526376326376127376225365d2838642b3c684e5f81a1adb88d8c87202e242d3937283a5b1e305521335a23345d22325b23345f23335e212d4b21315723345d253664273766303d607e635f8e7c8024355e25366226376322325b21325927376136487197a4af87847e222f282a373d1c2d4e1525401b2b4d21325a21315b22335f21325b29375941445b27314d2334602636652a3a64837981ab97921e2e532334602334601e2f571a294c22325a2c3d668e9ba7847f7727352f1a2834162543131d3615203b1c2c5121325d21325c21325d2f38556f6872232731303e5f2536652737646765748072731726451e315921325e1c2d5314213b1928462637598a969e867e7626332d16233513203b121c35131d3615233f20315b2030582231574f4d633f404c282a233b423f263660253563646475a28f8d15223e19294d20315d182849121d3715233a3d4b5c7c868c847d741e2a25131f35111c35111b34111b35111c351727471b2b4d212c474e506459565c746f6b7b73663b436324345e6a6774a2908e121f3817264720305b152341101b31131d2e252d3c3a414c63625f202c270f1a30111a35101a35101a340f1b33111b351320392226384d4f5ea7938ebfadabc1a9a25c5d70293656a7939186797c121d381c2a501e2f56131f340e1925151b281c23321e2535202634222c28121e2d101a33101a320f1a31101a33111b34121d352629397c6a6bc4aaa3c5aba6c4aaa59a8a8ca39090c4a9a48d7f802c32471d2e551a274126252d141822181e2b1c21301d24331e2333212b251a252b0f182f0f1930101831111b33101a33111b34212535775e56b89f95c4a9a3c5aaa5c5aaa4c6aaa6c5a9a4b298902b2f4318253e171f2c191d26141923181e2a191f2c1b212f1c212f1d29211a2527121d2b0d162a1018301820364e4b55171f351b1f294d463d9f847abd9f97c5a8a1c4a9a2c2a8a1a9938e554c4f191f2d191f2d181e2c191e2c191f2d161d28151a24151924171c271d281e141f24141e210e17290e162a141d329f8c88625c612f323b948279755f5a977870b79a929a868260585b30313b1a1f2d191f2d191e2c181e2b181d2a191e2b191e2b1a1f2b191e2a181e291b271d131d1e101b1a101b22101928101a2d615a5f786461554b506c5755181e2b5946444237381e212c181d2b181e2b171e2a181d29191d2a191d29181c29191d29191d2a1a1e2a1a1e2a1a1e2b151e1a17201c151e1d172023232f3a575a6381706e624f51604a49342e320f151f12172013182114182214182314182114182213182113162012161f12151f11141f131720141924171b26181d28111a18121a191e2a39222f4729375139425c343b562e36541e263810141e10141e10151d11141e10141e11141f11141f12151e11141f12141e12151e12141e10131c11141e11141e12151e1317211018161925322734522a37582b37592a36582a35552632501c263c141d2a11141e11141d10131c12141d11141d11141d11141d11141d11141d11141d12141d10131c10131c12141d12141e11141f151c1c202d45273453293656283554222f4a1e29421b253a192235182133131a2810131c11131d11141d12141d11141d11141d11141d11131d11141d11141d10131c10121c11141d12141d11141e';
const SIZE = 26;

// the big letters, 5 rows each; every '#' becomes a two-wide block
const FONT = {
  R: ['####.', '#...#', '####.', '#..#.', '#...#'],
  U: ['#...#', '#...#', '#...#', '#...#', '.###.'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..'],
  H: ['#...#', '#...#', '#####', '#...#', '#...#'],
  A: ['.###.', '#...#', '#####', '#...#', '#...#']
};

// the site's colours
const INK = [238, 241, 255], BLUE = [168, 216, 255], PINK = [255, 179, 217], MUTED = [166, 174, 211], LILAC = [201, 182, 255], MINT = [162, 240, 210], LEMON = [255, 229, 143];

module.exports = async function handler(req, res) {
  const plain = req.query && 'plain' in req.query;
  const fg = (c, s) => plain ? s : `\x1b[38;2;${c[0]};${c[1]};${c[2]}m${s}\x1b[0m`;
  const bold = (s) => plain ? s : `\x1b[1m${s}\x1b[22m`;
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  // white, then baby blue, then pink, like my name on the home page
  const grad = (t) => t < 0.5 ? mix(INK, BLUE, t * 2) : mix(BLUE, PINK, (t - 0.5) * 2);

  const out = [''];

  // big name
  const word = 'RUYTHA', W = word.length * 12;
  for (let r = 0; r < 5; r++) {
    let line = '  ';
    for (let i = 0; i < word.length; i++) {
      FONT[word[i]][r].split('').forEach((ch, k) => {
        const col = i * 12 + k * 2;
        line += ch === '#' ? fg(grad(col / W), '██') : '  ';
      });
      line += '  ';
    }
    out.push(line.replace(/\s+$/, ''));
  }
  out.push('');

  // the avatar: each character cell is two pixels, top one as the text colour, bottom one as the background
  const px = (x, y) => { const o = (y * SIZE + x) * 6; return [0, 2, 4].map((j) => parseInt(AVATAR.substr(o + j, 2), 16)); };
  const face = [];
  for (let y = 0; y < SIZE; y += 2) {
    let line = '';
    for (let x = 0; x < SIZE; x++) {
      const t = px(x, y), b = px(x, y + 1);
      line += plain ? '' : `\x1b[38;2;${t.join(';')}m\x1b[48;2;${b.join(';')}m▀`;
    }
    face.push(plain ? '' : line + '\x1b[0m');
  }

  // live bits: my time, and what I'm listening to
  let time = '';
  try { time = new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Perth' }).toLowerCase(); } catch (e) {}
  const np = await nowPlaying();

  const label = (s) => fg(MUTED, s.padEnd(9));
  const info = [
    fg(PINK, 'こんにちは') + fg(PINK, '  hi, i\'m ') + bold(fg(INK, 'Ruytha')),
    fg(MUTED, 'director · editor · lighting · lyric sync'),
    '',
    fg(MINT, '●') + ' ' + fg(INK, 'open to collabs') + fg(MUTED, ' · Australia' + (time ? ' · ' + time + ' my time' : '')),
    np ? fg(np.live ? PINK : MUTED, (np.live ? '♪ now playing  ' : '♪ last played  ')) + fg(INK, clip(np.track, 26)) + fg(MUTED, ' · ' + clip(np.artist, 16)) : fg(MUTED, '♪ probably listening to ') + fg(INK, 'Tame Impala'),
    '',
    label('web') + fg(BLUE, 'https://ruytha.dev'),
    label('email') + fg(BLUE, 'ruytha@ruytha.dev'),
    label('discord') + fg(BLUE, '@ruytha'),
    label('youtube') + fg(BLUE, 'youtube.com/@ruytha.m4a'),
    label('studios') + fg(BLUE, 'ruytha.dev/studios'),
    label('ko-fi') + fg(BLUE, 'ko-fi.com/ruytha'),
    ''
  ];

  if (plain) out.push(...info.map((l) => '  ' + l));
  else for (let i = 0; i < Math.max(face.length, info.length); i++) out.push('  ' + (face[i] || ' '.repeat(SIZE)) + '   ' + (info[i] || ''));

  out.push('');
  out.push('  ' + fg(LILAC, 'またね！') + fg(MUTED, ' thanks for curling by ') + fg(PINK, '♡') + fg(MUTED, '   the full site is nicer in a browser ') + fg(LEMON, '✦'));
  out.push('');

  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('vary', 'user-agent');
  res.status(200).send(out.join('\n') + '\n');
};

function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

async function nowPlaying() {
  // from my own NyaFM (the same site), no Last.fm
  const base = process.env.NYAFM_ORIGIN || 'https://ruytha.dev';
  const user = process.env.NYAFM_USER || process.env.LASTFM_USER || 'Ruytha';
  const get = (p) => fetch(base + '/v1/users/' + encodeURIComponent(user) + p, { signal: AbortSignal.timeout(1500) }).then((r) => r.json());
  try {
    const np = await get('/now-playing');
    if (np.playing && np.track) return { track: np.track.track, artist: np.track.artist, live: true };
    const rc = await get('/recent?limit=1');
    const t = rc.scrobbles && rc.scrobbles[0];
    return t ? { track: t.track, artist: t.artist, live: false } : null;
  } catch (e) { return null; }
}
