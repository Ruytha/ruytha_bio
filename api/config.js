const { requireAuth } = require('../lib/auth');
const { repoInfo } = require('../lib/github');

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  const { owner, repo, branch } = repoInfo();
  res.status(200).json({ owner, repo, branch });
};
