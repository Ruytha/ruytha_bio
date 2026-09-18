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

module.exports = { listFiles, getFile, putFile, repoInfo };
