const { requireAuth } = require('../lib/auth');
const { listFiles } = require('../lib/github');

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const files = await listFiles();
    res.status(200).json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
