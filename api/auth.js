const crypto = require('crypto');
const { expectedToken, isHttps } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }

  const password = (body && body.password) || '';
  const expectedPassword = process.env.DASHBOARD_PASSWORD || '';

  if (!expectedPassword) {
    res.status(500).json({ error: 'DASHBOARD_PASSWORD is not set on the server' });
    return;
  }

  const ok =
    password.length === expectedPassword.length &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expectedPassword));

  if (!ok) {
    res.status(401).json({ error: 'Incorrect password' });
    return;
  }

  const token = expectedToken();
  const secure = isHttps(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `dashboard_session=${token}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=86400`
  );
  res.status(200).json({ ok: true });
};
