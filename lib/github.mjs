export function repoSlug() {
  const raw = process.env.CMS_GITHUB_REPO
    || (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
      : 'mikakostoev/quality-cleaning-astana');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw)) {
    throw Object.assign(new Error('bad repo'), { code: 'CONFIG' });
  }
  return raw;
}

export function contentBranch() {
  const raw = process.env.CMS_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || 'main';
  if (!/^[A-Za-z0-9._/-]+$/.test(raw) || raw.includes('..') || raw.startsWith('/') || raw.endsWith('/')) {
    throw Object.assign(new Error('bad branch'), { code: 'CONFIG' });
  }
  return raw;
}

function refPath(branch) {
  return `heads/${branch.split('/').map((part) => encodeURIComponent(part)).join('%2F')}`;
}

export function createGithub({ token = process.env.CMS_GITHUB_TOKEN, repo = repoSlug(), fetchImpl = globalThis.fetch } = {}) {
  async function request(urlPath, { method = 'GET', body } = {}) {
    const response = await fetchImpl(`https://api.github.com${urlPath}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'quality-cleaning-admin',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { message: text.slice(0, 200) };
    }
    if (!response.ok) {
      const error = new Error(data?.message || response.statusText);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  return {
    async readFile(filePath, branch = contentBranch()) {
      const data = await request(`/repos/${repo}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`);
      return Buffer.from(String(data.content).replace(/\s/g, ''), 'base64').toString('utf8');
    },
    async commit({ branch = contentBranch(), files, message }) {
      const current = await request(`/repos/${repo}/git/ref/${refPath(branch)}`);
      const parent = current.object.sha;
      const parentCommit = await request(`/repos/${repo}/git/commits/${parent}`);
      const tree = [];
      for (const file of files) {
        const blob = await request(`/repos/${repo}/git/blobs`, {
          method: 'POST',
          body: { content: Buffer.from(file.content, 'utf8').toString('base64'), encoding: 'base64' },
        });
        tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      const nextTree = await request(`/repos/${repo}/git/trees`, {
        method: 'POST',
        body: { base_tree: parentCommit.tree.sha, tree },
      });
      const created = await request(`/repos/${repo}/git/commits`, {
        method: 'POST',
        body: { message, tree: nextTree.sha, parents: [parent] },
      });
      try {
        await request(`/repos/${repo}/git/refs/${refPath(branch)}`, {
          method: 'PATCH',
          body: { sha: created.sha, force: false },
        });
      } catch (error) {
        if (error.status === 422 || error.status === 409) {
          throw Object.assign(new Error('conflict'), { code: 'CONFLICT' });
        }
        throw error;
      }
      return { sha: created.sha };
    },
  };
}
