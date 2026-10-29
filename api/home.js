import { renderLivePage } from '../lib/publish.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Method not allowed');
    return;
  }
  try {
    const html = await renderLivePage();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'HEAD') res.end();
    else res.end(html);
  } catch {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Не удалось открыть страницу');
  }
}
