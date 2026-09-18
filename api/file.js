const { requireAuth } = require('../lib/auth');
const { getFile, putFile } = require('../lib/github');

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    const path = req.query.path;
    if (!path) {
      res.status(400).json({ error: 'Missing path' });
      return;
    }
    try {
      const { content, sha } = await getFile(path);
      res.status(200).json({ content, sha });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'PUT') {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }
    const { path, content, sha, message } = body || {};
    if (!path || content === undefined || !sha) {
      res.status(400).json({ error: 'Missing path, content, or sha' });
      return;
    }
    try {
      const result = await putFile(path, content, sha, message);
      res.status(200).json({
        ok: true,
        sha: result.content && result.content.sha,
        commit: result.commit && result.commit.sha,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
