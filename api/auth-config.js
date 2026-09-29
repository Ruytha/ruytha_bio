module.exports = (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.status(200).json({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',
    configured: Boolean(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY),
  });
};
