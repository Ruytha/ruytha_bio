const { requireAuth } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const claims = await requireAuth(req, res);
  if (!claims) return;
  res.status(200).json({ ok: true, userId: claims.sub });
};
