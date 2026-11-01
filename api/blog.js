/**
 * Blog publishing for /blog/write (signed-in admins only, same Clerk check as the admin panel).
 * The editor renders each post to static HTML itself; this just reads and commits files on GitHub.
 *
 * GET  /api/blog?action=list            -> { posts }      every post, drafts included (blog/posts/index.json)
 * GET  /api/blog?action=source&slug=x   -> { markdown }   a post's Markdown source
 * POST /api/blog?action=image           -> { sha }        body { data } (base64); stored, not yet committed
 * POST /api/blog?action=commit          -> { commit }     body { message, files: [{ path, content } | { path, sha }], deletes: [path] }
 */
const { requireAuth } = require('../lib/auth');
const { getFile, createBlob, commitChanges } = require('../lib/github');

const MAX_IMAGE = 4 * 1024 * 1024;        // base64 characters; Vercel caps request bodies at 4.5 MB
// The editor may only write inside blog/, and never over the page shells or the editor itself.
const ALLOWED = /^blog\/(posts\/[a-z0-9-]+\.md|posts\/index\.json|posts\.json|[a-z0-9-]+\.html|images\/[a-z0-9-]+\.(jpg|png|gif|webp))$/;
const PROTECTED = ['blog/index.html', 'blog/write.html'];

function okPath(p) { return typeof p === 'string' && ALLOWED.test(p) && !PROTECTED.includes(p); }

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (!(await requireAuth(req, res))) return;

  const action = String(req.query.action || '');
  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  try {
    if (req.method === 'GET' && action === 'list') {
      let posts = [];
      try { posts = JSON.parse((await getFile('blog/posts/index.json')).content); } catch (e) { posts = []; }
      res.status(200).json({ posts });
      return;
    }

    if (req.method === 'GET' && action === 'source') {
      const slug = String(req.query.slug || '');
      if (!/^[a-z0-9-]+$/.test(slug)) { res.status(400).json({ error: 'Bad post name' }); return; }
      const { content } = await getFile('blog/posts/' + slug + '.md');
      res.status(200).json({ markdown: content });
      return;
    }

    if (req.method === 'POST' && action === 'image') {
      const data = String(body.data || '');
      if (!data || data.length > MAX_IMAGE || !/^[A-Za-z0-9+/=]+$/.test(data)) {
        res.status(400).json({ error: 'That image is too big or unreadable. Try one under 3 MB.' });
        return;
      }
      res.status(200).json({ sha: await createBlob(data) });
      return;
    }

    if (req.method === 'POST' && action === 'commit') {
      const files = Array.isArray(body.files) ? body.files : [];
      const deletes = Array.isArray(body.deletes) ? body.deletes : [];
      const bad = files.map((f) => f && f.path).concat(deletes).find((p) => !okPath(p));
      if (bad !== undefined) { res.status(400).json({ error: 'Not allowed to write "' + bad + '"' }); return; }
      if (!files.length && !deletes.length) { res.status(400).json({ error: 'Nothing to save' }); return; }
      const changes = files.map((f) => (f.sha ? { path: f.path, sha: String(f.sha) } : { path: f.path, content: String(f.content == null ? '' : f.content) }))
        .concat(deletes.map((p) => ({ path: p, delete: true })));
      const message = String(body.message || 'Update blog').slice(0, 120) + ' via blog editor';
      res.status(200).json({ commit: await commitChanges(changes, message) });
      return;
    }

    res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    res.status(502).json({ error: err && err.message ? err.message : 'GitHub request failed' });
  }
};
