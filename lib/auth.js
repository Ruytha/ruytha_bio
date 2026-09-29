const { verifyToken } = require('@clerk/backend');

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function allowedUserIds() {
  return ['user_3JZRY7NAS2DoRVAv9pKjRBa9Qdp', ...(process.env.ADMIN_CLERK_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)];
}

// The admin is deny-by-default: Clerk proves identity and the allow-list
// decides which identities are permitted to commit to the repository.
async function requireAuth(req, res) {
  const token = getBearerToken(req);
  const secretKey = process.env.CLERK_SECRET_KEY;
  const admins = allowedUserIds();
  if (!token || !secretKey || admins.length === 0) {
    res.status(401).json({ error: 'Sign in with an authorized Clerk account to continue.' });
    return null;
  }

  try {
    const options = { secretKey };
    if (process.env.CLERK_AUTHORIZED_PARTIES) {
      options.authorizedParties = process.env.CLERK_AUTHORIZED_PARTIES.split(',').map((value) => value.trim()).filter(Boolean);
    }
    const claims = await verifyToken(token, options);
    if (!admins.includes(claims.sub)) {
      res.status(403).json({ error: 'This Clerk account is not allowed to manage the site.' });
      return null;
    }
    return claims;
  } catch (error) {
    res.status(401).json({ error: 'Your sign-in session is invalid or has expired.' });
    return null;
  }
}

module.exports = { requireAuth };
