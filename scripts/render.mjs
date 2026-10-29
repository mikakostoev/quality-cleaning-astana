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
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && path.resolve(process.argv[1]) === path.join(scriptDir, 'render.mjs')) {
  console.log(current === html ? 'index.html is up to date' : 'wrote index.html');
}
