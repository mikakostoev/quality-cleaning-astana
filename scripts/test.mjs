import fs from 'node:fs';
import assert from 'node:assert/strict';
import { ContentError, normalizeContent } from '../lib/content.mjs';
import { buildFaqPage, buildLocalBusiness } from '../lib/jsonld.mjs';
import { priceAnswer } from '../lib/prices.mjs';
import { renderSite, siteConfig } from '../lib/render.mjs';
import { checkCredentials, isConfigured, resetRateLimit, verifySession } from '../lib/auth.mjs';
import { getContent, login, putContent } from '../lib/admin-api.mjs';
import { publishContent, renderLivePage } from '../lib/publish.mjs';
import { writeStoredContent } from '../lib/store.mjs';

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
  assert.match(html, /Quality Клининг Company \(Quality Cleaning, Куалити Клининг\)/);
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
  assert.match(source, /data-extra="chem"|\[data-extra="chem"\]/);
  assert.doesNotMatch(source, /data-price="2000"/);
});

check('admin phone shell hides jump and dock until login', () => {
  const html = fs.readFileSync('admin/index.html', 'utf8');
  const css = fs.readFileSync('admin/admin.css', 'utf8');
  const js = fs.readFileSync('admin/admin.js', 'utf8');
  assert.match(html, /id="jump"[^>]*hidden/);
  assert.match(html, /id="dock"[^>]*hidden/);
  assert.match(html, /id="save"/);
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
  assert.match(css, /body\.editing \.dock/);
  assert.match(js, /dock\.hidden = false/);
  assert.match(js, /dock\.hidden = true/);
  assert.match(js, /classList\.add\('editing'\)/);
  for (const id of ['sec-prices', 'sec-phones', 'sec-hero', 'sec-services', 'sec-faq', 'sec-reviews', 'sec-more']) {
    assert.match(js, new RegExp(`id: '${id}'`));
  }
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

check('sitemap stays the homepage only', () => {
  const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
  assert.match(sitemap, /quality-cleaning-astana\.vercel\.app\/</);
  assert.equal(sitemap.includes('/admin'), false);
});

const host = { origin: 'http://127.0.0.1:4173', host: '127.0.0.1:4173', 'x-admin': '1' };

await checkAsync('login or password missing fails closed', async () => {
  const previousPassword = process.env.ADMIN_PASSWORD;
  const previousLogin = process.env.ADMIN_LOGIN;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_LOGIN;
  resetRateLimit();
  const entered = await login({ method: 'POST', headers: host, body: { login: 'owner', password: 'whatever-password' }, ip: '203.0.113.5', secure: false, now: 1 });
  const loaded = await getContent({ method: 'GET', headers: host, ip: '203.0.113.5', secure: false, now: 1 });
  assert.equal(entered.status, 503);
  assert.equal(loaded.status, 503);
  process.env.ADMIN_PASSWORD = 'correct-horse-battery';
  assert.equal(isConfigured(), false);
  process.env.ADMIN_LOGIN = '   ';
  assert.equal(isConfigured(), false);
  process.env.ADMIN_LOGIN = 'owner';
  process.env.ADMIN_PASSWORD = 'short';
  assert.equal(isConfigured(), false);
  process.env.ADMIN_PASSWORD = previousPassword;
  process.env.ADMIN_LOGIN = previousLogin;
});

await checkAsync('login, wrong password, and a price save', async () => {
  process.env.ADMIN_LOGIN = 'owner';
  process.env.ADMIN_PASSWORD = 'correct-horse-battery';
  resetRateLimit();
  const now = Date.now();
  const badPassword = await login({ method: 'POST', headers: host, body: { login: 'owner', password: 'not-the-password' }, ip: '203.0.113.8', secure: false, now });
  const badLogin = await login({ method: 'POST', headers: host, body: { login: 'other', password: 'correct-horse-battery' }, ip: '203.0.113.9', secure: false, now });
  assert.equal(badPassword.status, 401);
  assert.equal(badLogin.status, 401);
  assert.equal(badPassword.body.error, badLogin.body.error);
  assert.equal(checkCredentials('owner', 'correct-horse-battery'), true);
  const good = await login({ method: 'POST', headers: host, body: { login: ' owner ', password: 'correct-horse-battery' }, ip: '203.0.113.8', secure: false, now });
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
  const noStore = await putContent({
    method: 'PUT',
    headers: { ...host, cookie },
    body: { content: next },
    ip: '203.0.113.8',
    secure: false,
    now,
  }, { publish: async () => { throw Object.assign(new Error('no'), { code: 'NO_STORE' }); } });
  assert.equal(noStore.status, 503);
  assert.match(noStore.body.error, /Blob/);
  assert.equal(noStore.body.error.includes('GitHub'), false);
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_LOGIN;
});

await checkAsync('server save writes the price without GitHub', async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;
  delete process.env.CMS_LOCAL_PUBLISH;
  await assert.rejects(() => writeStoredContent('{}'), (error) => error.code === 'NO_STORE');
  const next = structuredClone(content);
  next.prices.general = 810;
  let stored = '';
  const saved = await publishContent(next, async (json) => { stored = json; });
  assert.match(saved.message, /сервере/);
  const page = renderSite(JSON.parse(stored));
  assert.match(page, /от <b>810<\/b> ₸\/м²/);
  assert.match(page, /"general":810/);
  const live = await renderLivePage();
  assert.match(live, /от <b>400<\/b> ₸\/м²/);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall tests passed');
