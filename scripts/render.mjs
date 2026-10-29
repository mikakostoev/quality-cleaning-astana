import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeContent } from '../lib/content.mjs';
import { projectRoot, renderSite } from '../lib/render.mjs';

const root = projectRoot();
const content = normalizeContent(JSON.parse(fs.readFileSync(path.join(root, 'content', 'site.json'), 'utf8')));
const html = renderSite(content, root);
const target = path.join(root, 'index.html');
const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
if (current !== html) fs.writeFileSync(target, html);

// Vercel serves the build from `public`. The repo root stays the source of the same files.
const out = path.join(root, 'public');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
const files = [
  'index.html', 'styles.css', 'app.js', 'robots.txt', 'sitemap.xml',
  'favicon.ico', 'favicon.svg', 'apple-touch-icon.png',
  'googlea86913d922ec07b4.html', 'yandex_4e8335a32fc2f611.html', 'BingSiteAuth.xml',
];
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(out, file));
for (const dir of ['img', 'video', 'admin']) {
  fs.cpSync(path.join(root, dir), path.join(out, dir), { recursive: true });
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && path.resolve(process.argv[1]) === path.join(scriptDir, 'render.mjs')) {
  console.log(current === html ? 'index.html is up to date' : 'wrote index.html');
  console.log('wrote public/');
}
