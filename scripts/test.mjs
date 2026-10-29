import fs from 'node:fs';
import assert from 'node:assert/strict';
import { ContentError, normalizeContent } from '../lib/content.mjs';
import { buildFaqPage, buildLocalBusiness } from '../lib/jsonld.mjs';
import { priceAnswer } from '../lib/prices.mjs';
import { renderSite, siteConfig } from '../lib/render.mjs';
import { checkLogin, checkPassword, isConfigured, resetRateLimit, verifySession } from '../lib/auth.mjs';
import { getContent, login, putContent } from '../lib/admin-api.mjs';
import { sendLoginCode } from '../lib/resend.mjs';
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
  assert.match(admin, /id="login-name"/);
  assert.match(admin, /autocomplete="one-time-code"/);
  const adminJs = fs.readFileSync('admin/admin.js', 'utf8');
  assert.match(adminJs, /step === 'otp'/);
  assert.match(adminJs, /resend: true/);
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
const AUTH_KEYS = ['ADMIN_PASSWORD', 'ADMIN_LOGIN', 'ADMIN_EMAIL', 'RESEND_API_KEY', 'RESEND_FROM', 'CMS_LOCAL_PUBLISH', 'VERCEL'];

function captureEnv(keys) {
  const saved = {};
  for (const key of keys) saved[key] = process.env[key];
  return () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function useAuthEnv() {
  process.env.ADMIN_LOGIN = 'admin';
  process.env.ADMIN_PASSWORD = 'correct-horse-battery';
  process.env.ADMIN_EMAIL = 'owner@example.com';
  process.env.RESEND_API_KEY = 're_test_key_123456';
  process.env.RESEND_FROM = 'Quality Клининг <login@example.com>';
  delete process.env.CMS_LOCAL_PUBLISH;
  delete process.env.VERCEL;
}

function cookieValue(setCookie, name) {
  const list = Array.isArray(setCookie) ? setCookie : [setCookie || ''];
  const row = list.find((item) => String(item).startsWith(`${name}=`));
  if (!row) return '';
  return decodeURIComponent(row.split(';')[0].slice(name.length + 1));
}

async function sessionHeader(ip, now) {
  const sent = [];
  const started = await login({
    method: 'POST',
    headers: host,
    body: { login: 'admin', password: 'correct-horse-battery' },
    ip,
    secure: false,
    now,
  }, { sendMail: async ({ code }) => { sent.push(code); } });
  assert.equal(started.status, 200);
  const otp = cookieValue(started.headers['Set-Cookie'], 'qc_otp');
  const done = await login({
    method: 'POST',
    headers: { ...host, cookie: `qc_otp=${encodeURIComponent(otp)}` },
    body: { code: sent.at(-1) },
    ip,
    secure: false,
    now,
  });
  assert.equal(done.status, 200);
  return `qc_admin=${encodeURIComponent(cookieValue(done.headers['Set-Cookie'], 'qc_admin'))}`;
}

await checkAsync('auth missing fails closed', async () => {
  const undo = captureEnv(AUTH_KEYS);
  try {
    for (const key of AUTH_KEYS) delete process.env[key];
    resetRateLimit();
    const entered = await login({ method: 'POST', headers: host, body: { login: 'admin', password: 'whatever-password' }, ip: '203.0.113.5', secure: false, now: 1 });
    const loaded = await getContent({ method: 'GET', headers: host, ip: '203.0.113.5', secure: false, now: 1 });
    assert.equal(entered.status, 503);
    assert.match(entered.body.error, /RESEND_API_KEY/);
    assert.equal(loaded.status, 503);
    assert.equal(isConfigured(), false);
    process.env.ADMIN_PASSWORD = 'short';
    process.env.ADMIN_LOGIN = 'ad';
    process.env.ADMIN_EMAIL = 'not-an-email';
    process.env.RESEND_API_KEY = 'short';
    process.env.RESEND_FROM = 'missing-at';
    assert.equal(isConfigured(), false);
    process.env.VERCEL = '1';
    process.env.CMS_LOCAL_PUBLISH = '1';
    process.env.ADMIN_PASSWORD = 'correct-horse-battery';
    process.env.ADMIN_LOGIN = 'admin';
    process.env.ADMIN_EMAIL = 'owner@example.com';
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    assert.equal(isConfigured(), false);
  } finally {
    undo();
  }
});

await checkAsync('login, otp, and a price save', async () => {
  const undo = captureEnv(AUTH_KEYS);
  try {
    useAuthEnv();
    resetRateLimit();
    const now = Date.now();
    const sent = [];
    const sendMail = async ({ to, code }) => { sent.push({ to, code }); };
    const bad = await login({
      method: 'POST', headers: host, body: { login: 'admin', password: 'not-the-password' }, ip: '203.0.113.8', secure: false, now,
    }, { sendMail });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error, 'Неверный логин или пароль');
    assert.equal(sent.length, 0);
    const badLogin = await login({
      method: 'POST', headers: host, body: { login: 'nope', password: 'correct-horse-battery' }, ip: '203.0.113.8', secure: false, now,
    }, { sendMail });
    assert.equal(badLogin.body.error, 'Неверный логин или пароль');
    assert.equal(checkPassword('correct-horse-battery'), true);
    assert.equal(checkLogin(' admin '), true);
    const forged = await login({
      method: 'POST',
      headers: { ...host, origin: 'https://evil.example' },
      body: { login: 'admin', password: 'correct-horse-battery' },
      ip: '203.0.113.8',
      secure: false,
      now,
    }, { sendMail });
    assert.equal(forged.status, 403);
    const started = await login({
      method: 'POST', headers: host, body: { login: 'admin', password: 'correct-horse-battery' }, ip: '203.0.113.8', secure: false, now,
    }, { sendMail });
    assert.equal(started.status, 200);
    assert.equal(started.body.step, 'otp');
    assert.equal(started.body.email, 'o***@example.com');
    assert.equal(sent[0].to, 'owner@example.com');
    assert.match(sent[0].code, /^\d{6}$/);
    const otp = cookieValue(started.headers['Set-Cookie'], 'qc_otp');
    assert.equal(verifySession(otp, now), false);
    const otpHeader = `qc_otp=${encodeURIComponent(otp)}`;
    const wrong = await login({
      method: 'POST', headers: { ...host, cookie: otpHeader }, body: { code: sent[0].code === '000000' ? '111111' : '000000' }, ip: '203.0.113.8', secure: false, now,
    });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error, 'Неверный код');
    const good = await login({
      method: 'POST', headers: { ...host, cookie: otpHeader }, body: { code: ` ${sent[0].code.slice(0, 3)} ${sent[0].code.slice(3)} ` }, ip: '203.0.113.8', secure: false, now,
    });
    assert.equal(good.status, 200);
    const session = cookieValue(good.headers['Set-Cookie'], 'qc_admin');
    assert.equal(verifySession(session, now), true);
    assert.equal(cookieValue(good.headers['Set-Cookie'], 'qc_otp'), '');
    const cookie = `qc_admin=${encodeURIComponent(session)}`;
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
  } finally {
    undo();
  }
});

await checkAsync('otp expires, locks after repeated guesses, and resend rotates the code', async () => {
  const undo = captureEnv(AUTH_KEYS);
  try {
    useAuthEnv();
    resetRateLimit();
    const now = Date.now();
    const sent = [];
    const sendMail = async ({ code }) => { sent.push(code); };
    const ip = '203.0.113.30';
    const started = await login({
      method: 'POST', headers: host, body: { login: 'admin', password: 'correct-horse-battery' }, ip, secure: false, now,
    }, { sendMail });
    const original = cookieValue(started.headers['Set-Cookie'], 'qc_otp');
    const header = `qc_otp=${encodeURIComponent(original)}`;
    const wrongCode = sent[0] === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const bad = await login({
        method: 'POST', headers: { ...host, cookie: header }, body: { code: wrongCode }, ip, secure: false, now,
      });
      assert.equal(bad.status, 401);
      if (attempt < 4) assert.equal(bad.body.error, 'Неверный код');
      else assert.equal(bad.body.step, 'credentials');
    }
    const locked = await login({
      method: 'POST', headers: { ...host, cookie: header }, body: { code: sent[0] }, ip, secure: false, now,
    });
    assert.equal(locked.status, 401);
    assert.equal(locked.body.step, 'credentials');
    const expiredAt = now + 10 * 60 * 1000;
    const again = await login({
      method: 'POST', headers: host, body: { login: 'admin', password: 'correct-horse-battery' }, ip: '203.0.113.31', secure: false, now,
    }, { sendMail });
    const otp = cookieValue(again.headers['Set-Cookie'], 'qc_otp');
    const otpHeader = `qc_otp=${encodeURIComponent(otp)}`;
    const expired = await login({
      method: 'POST', headers: { ...host, cookie: otpHeader }, body: { code: sent.at(-1) }, ip: '203.0.113.31', secure: false, now: expiredAt,
    });
    assert.equal(expired.status, 401);
    const cooled = await login({
      method: 'POST', headers: { ...host, cookie: otpHeader }, body: { resend: true }, ip: '203.0.113.31', secure: false, now,
    });
    assert.equal(cooled.status, 429);
    const resent = await login({
      method: 'POST', headers: { ...host, cookie: otpHeader }, body: { resend: true }, ip: '203.0.113.31', secure: false, now: now + 61_000,
    }, { sendMail });
    assert.equal(resent.status, 200);
    assert.equal(sent.length, 3);
    const nextHeader = `qc_otp=${encodeURIComponent(cookieValue(resent.headers['Set-Cookie'], 'qc_otp'))}`;
    const stale = await login({
      method: 'POST', headers: { ...host, cookie: nextHeader }, body: { code: sent[1] }, ip: '203.0.113.31', secure: false, now: now + 61_000,
    });
    assert.equal(stale.status, 401);
    const fresh = await login({
      method: 'POST', headers: { ...host, cookie: nextHeader }, body: { code: sent[2] }, ip: '203.0.113.31', secure: false, now: now + 61_000,
    });
    assert.equal(fresh.status, 200);
    const failedSend = await login({
      method: 'POST', headers: host, body: { login: 'admin', password: 'correct-horse-battery' }, ip: '203.0.113.32', secure: false, now,
    }, { sendMail: async () => { throw new Error('down'); } });
    assert.equal(failedSend.status, 502);
    assert.equal(failedSend.headers['Set-Cookie'], undefined);
    let seen = null;
    await sendLoginCode({
      to: 'owner@example.com',
      code: '123456',
      fetchImpl: async (url, options) => {
        seen = { url, headers: options.headers, body: JSON.parse(options.body) };
        return { ok: true, status: 200 };
      },
    });
    assert.equal(seen.url, 'https://api.resend.com/emails');
    assert.equal(seen.headers.Authorization, 'Bearer re_test_key_123456');
    assert.equal(seen.body.from, 'Quality Клининг <login@example.com>');
    assert.deepEqual(seen.body.to, ['owner@example.com']);
    assert.match(seen.body.text, /123456/);
    assert.equal(JSON.stringify(seen.body).includes('correct-horse-battery'), false);
    await assert.rejects(() => sendLoginCode({
      to: 'owner@example.com',
      code: '123456',
      fetchImpl: async () => ({ ok: false, status: 422 }),
    }));
    process.env.CMS_LOCAL_PUBLISH = '1';
    delete process.env.RESEND_API_KEY;
    delete process.env.VERCEL;
    let called = false;
    const logs = [];
    const previousInfo = console.info;
    console.info = (...args) => logs.push(args.join(' '));
    try {
      await sendLoginCode({
        to: 'owner@example.com',
        code: '654321',
        fetchImpl: async () => { called = true; return { ok: true }; },
      });
    } finally {
      console.info = previousInfo;
    }
    assert.equal(called, false);
    assert.match(logs.join('\n'), /654321/);
  } finally {
    undo();
  }
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
  const undo = captureEnv([...AUTH_KEYS, 'CMS_GITHUB_TOKEN']);
  try {
  delete process.env.CMS_LOCAL_PUBLISH;
  delete process.env.CMS_GITHUB_TOKEN;
  useAuthEnv();
  resetRateLimit();
  const now = Date.now();
  const cookie = await sessionHeader('203.0.113.20', now);
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
  } finally {
    undo();
  }
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
