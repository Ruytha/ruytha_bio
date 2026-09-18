const crypto = require('crypto');

// Derives the expected session token from the server-side password.
// The raw password is never sent to the browser or stored in the cookie.
function expectedToken() {
  const password = process.env.DASHBOARD_PASSWORD || '';
  return crypto.createHash('sha256').update(password).digest('hex');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  const token = cookies.dashboard_session;
  if (!token) return false;
  const expected = expectedToken();
  if (token.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch (e) {
    return false;
  }
}

function requireAuth(req, res) {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: 'Not authenticated' });
    return false;
  }
  return true;
}

function isHttps(req) {
  return (req.headers['x-forwarded-proto'] || '').includes('https');
}

module.exports = { expectedToken, parseCookies, isAuthenticated, requireAuth, isHttps };
