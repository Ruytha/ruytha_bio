const { requireAuth } = require('../lib/auth');

// GET /api/auth         -> verifies the Clerk session
// GET /api/auth-config  -> public Clerk config (rewritten here by vercel.json as ?config=1,
//                          which keeps the project under Vercel's 12-function Hobby limit)
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (req.query && req.query.config) {
    res.status(200).json({
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',
      configured: Boolean(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY),
    });
    return;
  }

  const claims = await requireAuth(req, res);
  if (!claims) return;
  res.status(200).json({ ok: true, userId: claims.sub });
};
