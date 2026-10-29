import fs from 'node:fs';
import assert from 'node:assert/strict';
import { ContentError, normalizeContent } from '../lib/content.mjs';
import { buildFaqPage, buildLocalBusiness } from '../lib/jsonld.mjs';
import { priceAnswer } from '../lib/prices.mjs';
import { renderSite, siteConfig } from '../lib/render.mjs';
import { checkPassword, isConfigured, resetRateLimit, verifySession } from '../lib/auth.mjs';
import { getContent, login, putContent } from '../lib/admin-api.mjs';
import { createGithub } from '../lib/github.mjs';
import { bumpSitemap, publishContent } from '../lib/publish.mjs';
import { assertWorksComplete, normalizeUploads, workFileChanges } from '../lib/works.mjs';

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log('ok', name);
  } catch (error) {
    failed += 1;
    console.error('FAIL', name);
    console.error(error);
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    console.log('ok', name);
  } catch (error) {
    failed += 1;
    console.error('FAIL', name);
    console.error(error);
  }
}

const raw = JSON.parse(fs.readFileSync('content/site.json', 'utf8'));
const content = normalizeContent(raw);
const html = renderSite(content);

check('render matches committed homepage', () => {
  assert.equal(html, fs.readFileSync('index.html', 'utf8'));
});

check('public html has no noindex and no leftover tokens', () => {
  assert.equal(html.includes('noindex'), false);
  assert.equal(html.includes('%%'), false);
});

check('prices flow into html, calculator config and json-ld', () => {
  const next = structuredClone(content);
  next.prices.wet = 450;
  next.prices.general = 810;
  next.prices.renovation = 900;
  next.prices.moveout = 950;
  next.prices.chem = 2500;
  next.prices.microwave = 4500;
  const page = renderSite(next);
  assert.match(page, /от <b>450<\/b> ₸\/м²/);
  assert.match(page, /от <b>810<\/b> ₸\/м²/);
  assert.match(page, /от <b>900<\/b> ₸\/м²/);
  assert.match(page, /от <b>950<\/b> ₸\/м²/);
  assert.match(page, /Влажная<small>от 450 ₸\/м²<\/small>/);
  assert.match(page, /name="description" content="[^"]*450 ₸\/м²/);
  const config = JSON.parse(page.match(/<script type="application\/json" id="site-config">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(config.prices, { wet: 450, general: 810, renovation: 900, moveout: 950 });
  assert.equal(config.extras.chem, 2500);
  assert.equal(config.names.moveout, next.services[3].calcName);
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)].map((m) => JSON.parse(m[1]));
  const offers = blocks[0].hasOfferCatalog.itemListElement;
  assert.equal(offers[0].priceSpecification.price, 450);
  assert.equal(offers[1].priceSpecification.price, 810);
  assert.equal(offers[2].priceSpecification.price, 900);
  assert.equal(offers[3].priceSpecification.price, 950);
  assert.equal(offers[4].priceSpecification.price, 2500);
  assert.equal(offers[3].itemOffered.name, 'Уборка перед заселением');
  assert.equal(blocks[0].priceRange, 'от 450 ₸/м²');
  assert.equal(blocks[1].mainEntity[0].acceptedAnswer.text, priceAnswer(next.prices, next.faq.priceTail));
  assert.match(blocks[1].mainEntity[0].acceptedAnswer.text, /перед заселением — от 950 ₸\/м²/);
  assert.match(page, /id="total">от 27 000 ₸</);
  assert.equal(page.includes('от <b>400</b>'), false);
});

check('default copy stays byte-for-byte with the original prices', () => {
  assert.match(html, /content="Клининг в Астане: влажная уборка от 400 ₸\/м², генеральная от 800, после ремонта от 850\. Своё оборудование и химия, заявки 24\/7, работаем по договору\."/);
  assert.match(html, /<h1 data-hero><span class="line"><span>Quality Клининг<\/span>/);
  assert.match(html, /Quality Клининг Company \(Quality Cleaning\)/);
  const business = buildLocalBusiness(content);
  assert.deepEqual(business.alternateName, content.brand.alternateName);
  assert.equal(buildFaqPage(content).mainEntity.length, content.faq.items.length);
  assert.deepEqual(siteConfig(content).prices, { wet: 400, general: 800, renovation: 850, moveout: 850 });
});

check('html in reviews is rejected', () => {
  const next = structuredClone(content);
  next.reviews.rows[0][0].text = '<script>alert(1)</script>';
  assert.throws(() => normalizeContent(next), ContentError);
});

check('app.js reads the same config the page embeds', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  assert.match(source, /siteConfig\?\.prices/);
  assert.match(source, /dataset\.before/);
  assert.match(source, /data-extra="chem"|\[data-extra="chem"\]/);
  assert.doesNotMatch(source, /data-price="2000"/);
});

check('admin is noindex and absent from the sitemap', () => {
  const admin = fs.readFileSync('admin/index.html', 'utf8');
  const robots = fs.readFileSync('robots.txt', 'utf8');
  const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
  assert.match(admin, /noindex/);
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Disallow: \/api/);
  assert.equal(sitemap.includes('/admin'), false);
  assert.equal(fs.existsSync('googlea86913d922ec07b4.html'), true);
  assert.equal(fs.existsSync('yandex_4e8335a32fc2f611.html'), true);
  assert.equal(fs.existsSync('BingSiteAuth.xml'), true);
});

check('sitemap lastmod bump keeps a single homepage url', () => {
  const next = bumpSitemap(fs.readFileSync('sitemap.xml', 'utf8'), '2026-10-29');
  assert.match(next, /<lastmod>2026-10-29<\/lastmod>/);
  assert.equal(next.includes('/admin'), false);
});

const host = { origin: 'http://127.0.0.1:4173', host: '127.0.0.1:4173', 'x-admin': '1' };

await checkAsync('password missing fails closed', async () => {
  const previous = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  resetRateLimit();
  const entered = await login({ method: 'POST', headers: host, body: { password: 'whatever-password' }, ip: '203.0.113.5', secure: false, now: 1 });
  const loaded = await getContent({ method: 'GET', headers: host, ip: '203.0.113.5', secure: false, now: 1 });
  assert.equal(entered.status, 503);
  assert.equal(loaded.status, 503);
  assert.equal(isConfigured(), false);
  process.env.ADMIN_PASSWORD = 'short';
  assert.equal(isConfigured(), false);
  process.env.ADMIN_PASSWORD = previous;
});

await checkAsync('login, wrong password, and a price save', async () => {
  process.env.ADMIN_PASSWORD = 'correct-horse-battery';
  resetRateLimit();
  const now = Date.now();
  const bad = await login({ method: 'POST', headers: host, body: { password: 'not-the-password' }, ip: '203.0.113.8', secure: false, now });
  assert.equal(bad.status, 401);
  assert.equal(checkPassword('correct-horse-battery'), true);
  const good = await login({ method: 'POST', headers: host, body: { password: 'correct-horse-battery' }, ip: '203.0.113.8', secure: false, now });
  assert.equal(good.status, 200);
  const cookie = good.headers['Set-Cookie'].split(';')[0];
  assert.equal(verifySession(decodeURIComponent(cookie.split('=')[1]), now), true);
  const denied = await getContent({ method: 'GET', headers: { ...host, cookie: '' }, ip: '203.0.113.8', secure: false, now });
  assert.equal(denied.status, 401);
  const next = structuredClone(content);
  next.prices.wet = 450;
  let published = null;
  const saved = await putContent({
    method: 'PUT',
    headers: { ...host, cookie },
    body: { content: next },
    ip: '203.0.113.8',
    secure: false,
    now,
  }, {
    async publish(value) {
      published = renderSite(value);
      return { message: 'Сохранено в тесте' };
    },
  });
  assert.equal(saved.status, 200);
  assert.match(published, /от <b>450<\/b> ₸\/м²/);
  const config = JSON.parse(published.match(/id="site-config">([\s\S]*?)<\/script>/)[1]);
  assert.equal(config.prices.wet, 450);
  const ld = JSON.parse(published.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/)[1]);
  assert.equal(ld.hasOfferCatalog.itemListElement[0].priceSpecification.price, 450);
  assert.match(published, /Влажная — от 450 ₸\/м²/);
  const noToken = await putContent({
    method: 'PUT',
    headers: { ...host, cookie },
    body: { content: next },
    ip: '203.0.113.8',
    secure: false,
    now,
  }, { publish: async () => { throw Object.assign(new Error('no'), { code: 'NO_TOKEN' }); } });
  assert.equal(noToken.status, 503);
  delete process.env.ADMIN_PASSWORD;
});

await checkAsync('github client commits on the branch name with a slash', async () => {
  process.env.CMS_BRANCH = 'mikakostoev/admin-panel-db3b';
  process.env.CMS_GITHUB_REPO = 'mikakostoev/quality-cleaning-astana';
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    if (url.includes('/git/ref/heads/mikakostoev%2Fadmin-panel-db3b') && (options.method || 'GET') === 'GET') {
      return json({ object: { sha: 'parent' } });
    }
    if (url.endsWith('/git/commits/parent')) return json({ tree: { sha: 'tree0' } });
    if (url.includes('/git/blobs')) return json({ sha: 'blob1' });
    if (url.includes('/git/trees')) return json({ sha: 'tree1' });
    if (url.endsWith('/git/commits')) return json({ sha: 'commit1' });
    if (url.includes('/git/refs/heads/mikakostoev%2Fadmin-panel-db3b') && options.method === 'PATCH') {
      return json({ ref: 'ok' });
    }
    if (url.includes('/contents/content/site.json')) {
      return json({ content: Buffer.from('{"ok":true}\n', 'utf8').toString('base64') });
    }
    return json({ message: 'nope' }, 404);
  };
  const github = createGithub({ token: 'test-token', fetchImpl });
  const text = await github.readFile('content/site.json');
  assert.equal(text, '{"ok":true}\n');
  const result = await github.commit({
    files: [{ path: 'content/site.json', content: '{}\n' }],
    message: 'Обновление текстов и цен сайта',
  });
  assert.equal(result.sha, 'commit1');
  assert.equal(calls.some((call) => call.url.includes('/git/refs/heads/mikakostoev%2Fadmin-panel-db3b')), true);
  assert.equal(calls.some((call) => call.body?.force), false);
  delete process.env.CMS_BRANCH;
});

function json(data, status = 200) {
  return { ok: status < 300, status, text: async () => JSON.stringify(data) };
}

check('empty work list does not add photo slots', () => {
  assert.equal(html.includes('img/works/'), false);
  assert.equal(html.includes('works-added'), false);
  assert.equal(html.includes('data-before='), false);
});

check('uploaded before/after pairs render into the gallery and slider', () => {
  const next = structuredClone(content);
  next.works = [{ id: 'abcdef012345', caption: 'Кухня & "стол"', portrait: true, rev: 3 }];
  const page = renderSite(next);
  assert.match(page, /class="gallery works-added"/);
  assert.match(page, /src="img\/works\/abcdef012345-before\.jpg\?v=3"/);
  assert.match(page, /src="img\/works\/abcdef012345-after\.jpg\?v=3"/);
  assert.match(page, /alt="Кухня &amp; &quot;стол&quot; до уборки"/);
  assert.match(page, /data-ba="w-abcdef012345"/);
  assert.match(page, /data-portrait="1"/);
  assert.match(page, /data-note="Реальная работа Quality Клининг: Кухня &amp; &quot;стол&quot;\."/);
  assert.equal(page.includes('<script>alert'), false);
  assert.equal(page.includes('%%'), false);
});

check('work entries reject bad ids, markup and too many pairs', () => {
  const badId = structuredClone(content);
  badId.works = [{ id: '../secret-file', caption: 'Кухня', portrait: false, rev: 1 }];
  assert.throws(() => normalizeContent(badId), ContentError);
  const badCaption = structuredClone(content);
  badCaption.works = [{ id: 'abcdef012345', caption: '<img>', portrait: false, rev: 1 }];
  assert.throws(() => normalizeContent(badCaption), ContentError);
  const tooMany = structuredClone(content);
  tooMany.works = Array.from({ length: 25 }, (_, index) => ({
    id: index.toString(16).padStart(12, '0'),
    caption: 'Пара',
    portrait: false,
    rev: 1,
  }));
  assert.throws(() => normalizeContent(tooMany), ContentError);
});

check('work uploads stay inside img/works and removals delete both files', () => {
  const jpeg = minimalJpeg();
  const works = [{ id: 'abcdef012345', caption: 'Кухня', portrait: false, rev: 2 }];
  const uploads = normalizeUploads([
    { id: 'abcdef012345', side: 'before', data: jpeg },
    { id: 'abcdef012345', side: 'after', data: jpeg },
  ], works);
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].bytes >= 100, true);
  const files = workFileChanges(
    [{ id: 'abcdef012345', caption: 'Кухня' }, { id: 'bbbbbbbbbbbb', caption: 'Старая' }],
    works,
    uploads,
  );
  assert.deepEqual(files.map((file) => file.path), [
    'img/works/abcdef012345-before.jpg',
    'img/works/abcdef012345-after.jpg',
    'img/works/bbbbbbbbbbbb-before.jpg',
    'img/works/bbbbbbbbbbbb-after.jpg',
  ]);
  assert.equal(files[2].deleted, true);
  assert.equal(files[3].deleted, true);
  const svg = Buffer.from('<svg></svg>'.padEnd(120, ' ')).toString('base64');
  assert.throws(() => normalizeUploads([{ id: 'abcdef012345', side: 'before', data: svg }], works), ContentError);
  assert.throws(() => assertWorksComplete([], works, []), ContentError);
});

await checkAsync('a new pair without both photos is rejected and a complete pair stops only on missing token', async () => {
  delete process.env.CMS_LOCAL_PUBLISH;
  delete process.env.CMS_GITHUB_TOKEN;
  process.env.ADMIN_PASSWORD = 'correct-horse-battery';
  resetRateLimit();
  const now = Date.now();
  const good = await login({ method: 'POST', headers: host, body: { password: 'correct-horse-battery' }, ip: '203.0.113.20', secure: false, now });
  const cookie = good.headers['Set-Cookie'].split(';')[0];
  const next = structuredClone(content);
  next.works = [{ id: 'abcdef012345', caption: 'Кухня', portrait: true, rev: 2 }];
  const missing = await putContent({
    method: 'PUT',
    headers: { ...host, cookie },
    body: { content: next, uploads: [] },
    ip: '203.0.113.20',
    secure: false,
    now,
  }, { publish: publishContent });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /фото/);
  const jpeg = minimalJpeg();
  const noToken = await putContent({
    method: 'PUT',
    headers: { ...host, cookie },
    body: {
      content: next,
      uploads: [
        { id: 'abcdef012345', side: 'before', data: jpeg },
        { id: 'abcdef012345', side: 'after', data: jpeg },
      ],
    },
    ip: '203.0.113.20',
    secure: false,
    now,
  }, { publish: publishContent });
  assert.equal(noToken.status, 503);
  assert.equal(fs.existsSync('img/works/abcdef012345-before.jpg'), false);
  delete process.env.ADMIN_PASSWORD;
});

await checkAsync('github commit stores jpeg bytes and deletes removed work photos', async () => {
  process.env.CMS_BRANCH = 'main';
  process.env.CMS_GITHUB_REPO = 'mikakostoev/quality-cleaning-astana';
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    if (url.includes('/git/ref/heads/main') && (options.method || 'GET') === 'GET') return json({ object: { sha: 'parent' } });
    if (url.endsWith('/git/commits/parent')) return json({ tree: { sha: 'tree0' } });
    if (url.includes('/git/blobs')) return json({ sha: `blob${calls.length}` });
    if (url.includes('/git/trees')) return json({ sha: 'tree1' });
    if (url.endsWith('/git/commits')) return json({ sha: 'commit1' });
    if (url.includes('/git/refs/heads/main') && options.method === 'PATCH') return json({ ref: 'ok' });
    return json({ message: 'nope' }, 404);
  };
  const github = createGithub({ token: 'test-token', fetchImpl });
  const jpeg = minimalJpeg();
  await github.commit({
    message: 'Обновление текстов, цен и фото работ',
    files: [
      { path: 'content/site.json', content: '{}\n' },
      { path: 'img/works/abcdef012345-before.jpg', content: jpeg, encoding: 'base64' },
      { path: 'img/works/bbbbbbbbbbbb-before.jpg', deleted: true },
    ],
  });
  const blobs = calls.filter((call) => call.url.includes('/git/blobs'));
  assert.equal(blobs.length, 2);
  assert.equal(blobs.some((call) => call.body.content === jpeg && call.body.encoding === 'base64'), true);
  const tree = calls.find((call) => call.url.includes('/git/trees')).body.tree;
  const removed = tree.find((item) => item.path === 'img/works/bbbbbbbbbbbb-before.jpg');
  assert.equal(removed.sha, null);
  await assert.rejects(
    () => github.commit({ files: [{ path: '../evil.jpg', content: 'x' }], message: 'no' }),
    (error) => error.code === 'PATH',
  );
  delete process.env.CMS_BRANCH;
});

function minimalJpeg() {
  const buf = Buffer.alloc(120, 7);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[119] = 0xd9;
  return buf.toString('base64');
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall tests passed');
