import { get, put } from '@vercel/blob';

const PATHNAME = 'site/content.json';

export function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function access() {
  return process.env.BLOB_READ_WRITE_TOKEN ? 'public' : 'private';
}

async function readStream(stream) {
  const response = new Response(stream);
  return response.text();
}

export async function readStoredContent() {
  if (!blobConfigured()) return null;
  const result = await get(PATHNAME, { access: access(), useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const raw = await readStream(result.stream);
  return raw.trim() ? raw : null;
}

export async function writeStoredContent(json) {
  if (!blobConfigured()) {
    throw Object.assign(new Error('no blob'), { code: 'NO_STORE' });
  }
  await put(PATHNAME, json, {
    access: access(),
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}
