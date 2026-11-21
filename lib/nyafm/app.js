// NyaFM — your own Last.fm. One Hono app, runs on Vercel, Netlify or plain Node.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle as lastfm } from './lastfm.js';
import { lb } from './listenbrainz.js';
import { web } from './web.js';
import { v1 } from './v1.js';
import { term } from './term.js';
import { spotify } from './spotify.js';
import { lyrics } from './lyrics.js';
import * as core from './core.js';

const app = new Hono();

// Scrobblers (Spicetify, browser extensions) call from other origins.
app.use('/2.0/*', cors());
app.use('/2.0', cors());
app.use('/1/*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'] }));
app.use('/apis/*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'] }));

// Last.fm / Audioscrobbler 2.0
for (const p of ['/2.0', '/2.0/']) { app.get(p, lastfm); app.post(p, lastfm); }

// ListenBrainz (also under /apis/listenbrainz/1 like Maloja, for clients that want a path)
app.route('/1', lb);
app.route('/apis/listenbrainz/1', lb);

// Last.fm desktop auth page (clients open this with ?token=...)
app.get('/fm/api/auth', (c) => c.redirect(`/fm#/authorize?token=${encodeURIComponent(c.req.query('token') || '')}`));
app.get('/fm/api/auth/', (c) => c.redirect(`/fm#/authorize?token=${encodeURIComponent(c.req.query('token') || '')}`));

// NyaFM REST API v1 (docs: /#/api)
app.route('/v1', v1);
app.get('/api/lyrics', lyrics);

// Terminal dashboard: curl <site>/term
app.route('/term', term);
app.route('/fm/term', term);

// Dashboard JSON API
app.route('/fm/api/spotify', spotify);
app.route('/fm/api', web);

app.get('/fm/api/health', (c) => c.json({ ok: true, name: 'NyaFM', storage: core.backend() }));

app.notFound((c) => c.json({ ok: false, error: 'Not found' + (c.req.path.startsWith('/v1') ? ' — see /v1 for endpoints' : '') }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal error', detail: String(err.message || err) }, 500);
});

export default app;
