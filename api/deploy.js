const { requireAuth } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!(await requireAuth(req, res))) return;

  const hookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!hookUrl) {
    res.status(503).json({ error: 'Production deploy is not configured. Add VERCEL_DEPLOY_HOOK_URL in Vercel.' });
    return;
  }

  try {
    const deployResponse = await fetch(hookUrl, { method: 'POST' });
    if (!deployResponse.ok) throw new Error(`Vercel deploy hook returned ${deployResponse.status}`);
    res.status(202).json({ ok: true, message: 'Production deployment has been requested.' });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Could not request a production deployment.' });
  }
};
