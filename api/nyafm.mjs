// NyaFM (self-hosted Last.fm). One Hono app serving /2.0, /1, /v1, /apis and /fm/api.
// vercel.json rewrites those paths here; the dashboard UI is static, in /fm.
// Env: Upstash (KV_REST_API_URL / KV_REST_API_TOKEN) and NYAFM_SETUP_KEY.
import app from '../lib/nyafm/app.js';

export default { fetch: (request) => app.fetch(request) };
