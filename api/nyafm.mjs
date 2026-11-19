// NyaFM (self-hosted Last.fm). One Hono app serving /2.0, /1, /v1, /apis and /fm/api.
// vercel.json rewrites those paths here; the dashboard UI is static, in /fm.
// Env: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, NYAFM_SETUP_KEY (see fm/README or lib/nyafm).
import { handle } from '@hono/node-server/vercel';
import app from '../lib/nyafm/app.js';

export default handle(app);
