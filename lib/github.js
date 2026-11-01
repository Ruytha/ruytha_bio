const GITHUB_API = 'https://api.github.com';

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'site-dashboard',
  };
}

function repoInfo() {
  return {
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    branch: process.env.GITHUB_BRANCH || 'main',
  };
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function listFiles() {
  const { owner, repo, branch } = repoInfo();
  const branchRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/branches/${branch}`, {
    headers: ghHeaders(),
  });
  if (!branchRes.ok) throw new Error(`Could not read branch "${branch}" (${branchRes.status})`);
  const branchData = await branchRes.json();
  const treeSha = branchData.commit.commit.tree.sha;

  const treeRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`, {
    headers: ghHeaders(),
  });
  if (!treeRes.ok) throw new Error(`Could not read file tree (${treeRes.status})`);
  const treeData = await treeRes.json();

  return (treeData.tree || [])
    .filter((item) => item.type === 'blob')
    .map((item) => ({ path: item.path, sha: item.sha, size: item.size }));
}

async function getFile(path) {
  const { owner, repo, branch } = repoInfo();
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
    { headers: ghHeaders() }
  );
  if (!res.ok) throw new Error(`Could not read "${path}" (${res.status})`);
  const data = await res.json();
  if (Array.isArray(data)) throw new Error(`"${path}" is a folder, not a file`);
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return { content, sha: data.sha };
}

async function putFile(path, content, sha, message) {
  const { owner, repo, branch } = repoInfo();
  const body = {
    message: message || `Update ${path} via site dashboard`,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch,
    sha,
  };
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    if (res.status === 409 || res.status === 422) {
      throw new Error(`"${path}" changed elsewhere since it was loaded — refresh and try again.`);
    }
    throw new Error(`GitHub commit failed for "${path}" (${res.status}): ${errBody}`);
  }
  return res.json();
}

// Stores binary content (base64) as a git blob without committing it; commitChanges can reference it later.
async function createBlob(base64) {
  const { owner, repo } = repoInfo();
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: base64, encoding: 'base64' }),
  });
  if (!res.ok) throw new Error(`GitHub could not store the file (${res.status})`);
  return (await res.json()).sha;
}

// Writes several files in one commit, so one save means one deploy.
// Each change is { path, content } (text), { path, sha } (an existing blob) or { path, delete: true }.
async function commitChanges(changes, message) {
  const { owner, repo, branch } = repoInfo();
  const base = `${GITHUB_API}/repos/${owner}/${repo}/git`;
  const json = { ...ghHeaders(), 'Content-Type': 'application/json' };
  for (let attempt = 0; attempt < 2; attempt++) {
    const refRes = await fetch(`${base}/ref/heads/${encodeURIComponent(branch)}`, { headers: ghHeaders() });
    if (!refRes.ok) throw new Error(`Could not read branch "${branch}" (${refRes.status})`);
    const parent = (await refRes.json()).object.sha;
    const parentRes = await fetch(`${base}/commits/${parent}`, { headers: ghHeaders() });
    if (!parentRes.ok) throw new Error(`Could not read the latest commit (${parentRes.status})`);
    const baseTree = (await parentRes.json()).tree.sha;

    const tree = changes.map((c) => c.delete
      ? { path: c.path, mode: '100644', type: 'blob', sha: null }
      : c.sha ? { path: c.path, mode: '100644', type: 'blob', sha: c.sha }
      : { path: c.path, mode: '100644', type: 'blob', content: c.content });
    const treeRes = await fetch(`${base}/trees`, { method: 'POST', headers: json, body: JSON.stringify({ base_tree: baseTree, tree }) });
    if (!treeRes.ok) throw new Error(`GitHub could not build the commit (${treeRes.status}): ${await treeRes.text().catch(() => '')}`);
    const commitRes = await fetch(`${base}/commits`, {
      method: 'POST', headers: json,
      body: JSON.stringify({ message, tree: (await treeRes.json()).sha, parents: [parent] }),
    });
    if (!commitRes.ok) throw new Error(`GitHub could not create the commit (${commitRes.status})`);
    const commit = (await commitRes.json()).sha;
    const update = await fetch(`${base}/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', headers: json, body: JSON.stringify({ sha: commit }) });
    if (update.ok) return commit;
    // Someone else committed in between: rebuild on top of the new tip once.
    if (update.status !== 422 || attempt === 1) throw new Error(`GitHub refused the commit (${update.status})`);
  }
}

module.exports = { listFiles, getFile, putFile, repoInfo, createBlob, commitChanges };
