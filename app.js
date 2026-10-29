// Quality Клининг Company — заставка, плавный скролл, анимации, калькулятор
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const G = window.gsap && window.ScrollTrigger ? window.gsap : null;
const motion = G && !reduce;
const siteConfig = (() => {
  try {
    const el = document.getElementById('site-config');
    return el ? JSON.parse(el.textContent) : null;
  } catch {
    return null;
  }
})();
const WA = 'https://wa.me/' + (siteConfig?.whatsapp || '77779527961') + '?text=';

// WhatsApp-ссылки сразу с приветствием
$$('[data-wa]').forEach(a => { a.href = WA + encodeURIComponent(a.dataset.wa || 'Здравствуйте! Хочу заказать уборку.'); });

// без GSAP (CDN недоступен) или при «меньше движения» — статичная страница
if (!motion) root.classList.remove('anim');

let lenis = null;
if (motion) {
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true }); // адресная строка телефона не должна пересчитывать закрепления
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.07, wheelMultiplier: 0.85 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
}
const scrollToEl = el => lenis ? lenis.scrollTo(el, { offset: -76, duration: 1.4 }) : el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });

// кнопка WhatsApp прячется, пока на экране блок контактов (там свои кнопки)
const fab = $('.fab'), contacts = $('#contacts');
if (fab && contacts && 'IntersectionObserver' in window) new IntersectionObserver(([e]) => fab.classList.toggle('away', e.isIntersecting), { threshold: .25 }).observe(contacts);

/* ---------- шапка и меню ---------- */
const header = $('.header'), burger = $('.burger');
let lastY = 0;
const onScroll = () => {
  const y = scrollY;
  header.classList.toggle('scrolled', y > 10);
  header.classList.toggle('hide', y > lastY && y > 400 && !header.classList.contains('nav-open'));
  lastY = y;
};
addEventListener('scroll', onScroll, { passive: true });
onScroll();
const closeNav = () => {
  if (!header.classList.contains('nav-open')) return;
  header.classList.remove('nav-open');
  burger.setAttribute('aria-expanded', 'false');
  lenis?.start();
};
burger.addEventListener('click', () => {
  const open = header.classList.toggle('nav-open');
  burger.setAttribute('aria-expanded', open);
  open ? lenis?.stop() : lenis?.start();
});
addEventListener('keydown', e => { if (e.key === 'Escape') closeNav(); });
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  closeNav();
  const el = a.hash.length > 1 && document.querySelector(a.hash);
  if (!el || !lenis) return; // без Lenis работает CSS scroll-behavior
  e.preventDefault();
  scrollToEl(el);
});

/* ---------- калькулятор ---------- */
const PRICES = siteConfig?.prices || { wet: 400, general: 800, renovation: 850, moveout: 850 };
const NAMES = siteConfig?.names || { wet: 'Влажная уборка', general: 'Генеральная уборка', renovation: 'Уборка после ремонта', moveout: 'Уборка после прежних жильцов' };
const form = $('#calc-form'), range = $('#area'), num = $('#area-num'), out = $('#total');
const fmt = n => Math.round(n).toLocaleString('ru-RU');
const shown = { v: 0 };
const calc = () => {
  const kind = form.querySelector('[name=kind]:checked').value;
  const area = Math.max(+num.value || 0, 0);
  const extras = $$('[name=extra]:checked', form);
  const sum = area * PRICES[kind] + extras.reduce((s, e) => s + (+e.dataset.price || 0), 0);
  return { kind, area, extras: extras.map(e => e.value), sum };
};
const setRangeFill = r => r.style.setProperty('--p', (r.value - r.min) / (r.max - r.min) * 100 + '%');
const render = () => {
  setRangeFill(range);
  const { sum } = calc();
  const paint = () => { out.textContent = 'от ' + fmt(shown.v) + ' ₸'; };
  if (motion) gsap.to(shown, { v: sum, duration: .6, ease: 'power3.out', overwrite: true, onUpdate: paint });
  else { shown.v = sum; paint(); }
};
const setKind = k => { const r = form.querySelector(`[name=kind][value="${k}"]`); if (r) { r.checked = true; render(); } };
range.addEventListener('input', () => { num.value = range.value; render(); });
num.addEventListener('input', () => { if (+num.value) range.value = Math.min(300, Math.max(20, +num.value)); render(); });
num.addEventListener('blur', () => { num.value = Math.min(1000, Math.max(10, +num.value || 60)); render(); });
form.addEventListener('change', render);
form.addEventListener('submit', e => {
  e.preventDefault();
  const { kind, area, extras, sum } = calc();
  const lines = ['Здравствуйте! Хочу заказать уборку (расчёт с сайта):', `• ${NAMES[kind]}, ${area} м²`];
  if (extras.length) lines.push('• Доп. услуги: ' + extras.join(', '));
  lines.push(`• Предварительно: от ${fmt(sum)} ₸`, 'Когда сможете приехать?');
  window.open(WA + encodeURIComponent(lines.join('\n')), '_blank', 'noopener');
});
$$('[data-pick]').forEach(b => b.addEventListener('click', () => {
  setKind(b.dataset.pick);
  scrollToEl($('#calc'));
  if (motion) gsap.fromTo('.calc', { scale: .97 }, { scale: 1, duration: 1, delay: 1.1, ease: 'elastic.out(1, .45)' });
}));
$$('[data-chem]').forEach(b => b.addEventListener('click', () => {
  const chem = form.querySelector('[data-extra="chem"]');
  if (chem) chem.checked = true;
  render();
  scrollToEl($('#calc'));
}));
setKind(new URLSearchParams(location.search).get('type') || 'wet'); // ?type=general — для рекламы

/* ---------- до / после ---------- */
const stage = $('#ba'), baPct = $('#ba-pct'), baRange = $('.ba-range');
const setBA = p => {
  stage.style.setProperty('--p', p * 100 + '%');
  baPct.textContent = Math.round(12 + 88 * p) + '%';
};
// «Наш объект» — реальная пара фото; остальные вкладки — пример, «до» нарисовано фильтром (класс .fake)
const unsplash = id => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&h=1000&q=70`;
const BA = {
  real: { before: 'img/ba-real-before.jpg', after: 'img/ba-real-after.jpg', beforeAlt: 'Полка под раковиной до уборки', afterAlt: 'Полка под раковиной после уборки', note: 'Реальная работа Quality Клининг: полка под раковиной до и после уборки.' },
  hood: { before: 'img/hood-before.jpg', after: 'img/hood-after.jpg', beforeAlt: 'Жирные фильтры вытяжки и противень до мойки', afterAlt: 'Чистые фильтры вытяжки и противень после мойки', portrait: true, note: 'Реальная работа Quality Клининг: фильтры вытяжки и противень с решёткой до и после мойки.' },
  living: { id: '1633505899118-4ca6bd143043', beforeAlt: 'Иллюстрация гостиной', afterAlt: 'Иллюстрация гостиной' },
  kitchen: { id: '1610276173132-c47d148ab626', beforeAlt: 'Иллюстрация кухни', afterAlt: 'Иллюстрация кухни' },
  bath: { id: '1552321554-5fefe8c9ef14', beforeAlt: 'Иллюстрация ванной', afterAlt: 'Иллюстрация ванной' },
};
const baNote = $('#ba-note'), [baBefore, baAfter] = [$('.ba-before img', stage), $('.ba-after img', stage)];
$$('.ba-tabs button').forEach(b => b.addEventListener('click', () => {
  $$('.ba-tabs button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
  const uploaded = b.dataset.before && b.dataset.after;
  const s = uploaded ? {
    before: b.dataset.before,
    after: b.dataset.after,
    portrait: b.dataset.portrait === '1',
    note: b.dataset.note,
    beforeAlt: b.dataset.beforeAlt,
    afterAlt: b.dataset.afterAlt,
  } : BA[b.dataset.ba];
  if (!s) return;
  const before = s.id ? unsplash(s.id) : s.before, after = s.id ? unsplash(s.id) : s.after, pre = new Image();
  stage.classList.add('swap');
  pre.onload = pre.onerror = () => {
    baBefore.src = before; baAfter.src = after;
    if (s.beforeAlt) baBefore.alt = s.beforeAlt;
    if (s.afterAlt) baAfter.alt = s.afterAlt;
    stage.classList.toggle('fake', !!s.id);
    stage.classList.toggle('portrait', !!s.portrait);
    baNote.textContent = s.note || 'Иллюстрация. Реальную работу смотрите во вкладке «Наш объект» и в разделе «Наши работы».';
    stage.classList.remove('swap');
  };
  pre.src = after;
}));

/* ---------- что входит: чек-листы ---------- */
const setCl = name => {
  $$('.cl-tabs [data-cl]').forEach(x => { x.classList.toggle('on', x.dataset.cl === name); x.setAttribute('aria-pressed', x.dataset.cl === name); });
  const panel = $(`.cl-panel[data-panel="${name}"]`), prev = $$('.cl-panel').find(p => !p.hidden && p !== panel);
  const show = () => {
    $$('.cl-panel').forEach(p => { p.hidden = p !== panel; });
    if (!motion) return;
    gsap.from($$('.cl-scope, .cl-card, .cl-box', panel), { y: 22, opacity: 0, duration: .7, stagger: .05, ease: 'power3.out', clearProps: 'transform,opacity' });
    ScrollTrigger.refresh(); // высота блока меняется — пересчитать закреплённую секцию ниже
  };
  clearTimeout(setCl.t);
  if (motion && prev) {
    gsap.to(prev, { opacity: 0, duration: .2, ease: 'power1.in', overwrite: true });
    setCl.t = setTimeout(() => { gsap.set(prev, { clearProps: 'opacity' }); show(); }, 210);
  } else show();
};
$$('[data-cl]').forEach(b => b.addEventListener('click', () => {
  setCl(b.dataset.cl);
  if (!b.closest('.cl-tabs')) scrollToEl($('#checklist'));
}));

/* ---------- живые фото: просмотр крупно ---------- */
const lb = $('#lightbox'), lbBody = $('.lb-body', lb), lbCap = $('.lb-cap', lb);
$$('.g-tile').forEach(t => t.addEventListener('click', () => {
  lbBody.replaceChildren(...$$('img', t).map(i => { const c = i.cloneNode(); c.removeAttribute('loading'); return c; }));
  lbCap.textContent = $('.cap', t)?.textContent || '';
  lb.showModal();
  lenis?.stop();
}));
lb.addEventListener('close', () => lenis?.start());
lb.addEventListener('click', e => { if (e.target === lb || e.target.closest('.lb-close')) lb.close(); });
baRange.addEventListener('input', () => { setRangeFill(baRange); setBA(baRange.value / 100); });
setRangeFill(baRange);
setBA(.5);

/* ---------- видео: одновременно играет только одно ---------- */
const vids = $$('.vid video');
vids.forEach(v => v.addEventListener('play', () => vids.forEach(o => { if (o !== v) o.pause(); })));

/* ---------- отзывы: бесшовная лента ---------- */
$$('.mq-track').forEach(t => t.append(...[...t.children].map(n => { const c = n.cloneNode(true); c.setAttribute('aria-hidden', 'true'); return c; })));

/* ---------- шаги ---------- */
const stepsWrap = $('.steps-wrap'), steps = $$('.steps li');
const setSteps = v => {
  stepsWrap.style.setProperty('--prog', v);
  steps.forEach((li, i) => li.classList.toggle('on', v >= Math.max(.02, i / (steps.length - 1) - .03)));
};

/* ---------- анимации ---------- */
function splitWords(h) {
  const wrap = node => { const o = document.createElement('span'), i = document.createElement('span'); o.className = 'w'; i.append(node); o.append(i); return o; };
  const parts = [];
  h.childNodes.forEach(n => {
    if (n.nodeType === 3) n.textContent.split(/(\s+)/).forEach(w => { if (w) parts.push(/^\s+$/.test(w) ? document.createTextNode(w) : wrap(document.createTextNode(w))); });
    else parts.push(wrap(n.cloneNode(true)));
  });
  h.replaceChildren(...parts);
}

function heroIn() {
  root.classList.remove('anim');
  if (!motion) return;
  gsap.timeline({ defaults: { ease: 'power3.out' } })
    .from('.hero-pill', { y: 16, opacity: 0, duration: .6 })
    .from('.hero h1 .line > span', { yPercent: 115, duration: 1.05, stagger: .09, ease: 'power4.out' }, 0)
    .from('.hero .script', { clipPath: 'inset(-10% 105% -40% 0%)', duration: 1.1, ease: 'power2.inOut' }, .45)
    .from('.hero .swoosh path', { strokeDashoffset: 1, duration: .9, ease: 'power2.out' }, 1)
    .from('.hero-lead, .hero-cta > *, .hero-trust > li', { y: 24, opacity: 0, duration: .8, stagger: .07 }, .5)
    .from('.arch', { clipPath: 'inset(100% 0% 0% 0% round 220px 220px 36px 36px)', duration: 1.3, ease: 'expo.out' }, .15)
    .from('.arch img', { scale: 1.3, duration: 1.8, ease: 'expo.out' }, .15)
    .from('.chip', { scale: .5, opacity: 0, duration: .9, stagger: .12, ease: 'back.out(1.7)' }, .75);
}

if (motion) {
  $$('[data-split]').forEach(h => {
    splitWords(h);
    gsap.from($$('.w > span', h), { yPercent: 115, duration: 1, ease: 'power4.out', stagger: .06, scrollTrigger: { trigger: h, start: 'top 88%', once: true } });
  });
  $$('[data-reveal]').forEach(el => gsap.from(el, { y: 28, opacity: 0, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true } }));
  $$('[data-stagger]').forEach(g => gsap.from(g.children, { y: 40, opacity: 0, duration: 1.1, ease: 'power3.out', stagger: .1, scrollTrigger: { trigger: g, start: 'top 88%', once: true } }));
  $$('[data-count]').forEach(el => {
    const to = +el.dataset.count, dec = (el.dataset.count.split('.')[1] || '').length, o = { v: 0 };
    el.textContent = (0).toFixed(dec);
    gsap.to(o, { v: to, duration: 2, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true }, onUpdate: () => { el.textContent = o.v.toFixed(dec); } });
  });

  // параллакс первого экрана
  const heroST = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: .6 };
  gsap.to('.hero-bg', { yPercent: 10, ease: 'none', scrollTrigger: heroST });
  gsap.to('.hero-visual', { yPercent: -10, ease: 'none', scrollTrigger: { ...heroST } });

  // до/после: секция закрепляется, скребок протирает комнату по мере прокрутки
  stage.classList.add('scrub');
  const ba = { p: 0 };
  setBA(0);
  gsap.to(ba, { p: 1, ease: 'none', onUpdate: () => setBA(ba.p), scrollTrigger: { trigger: '.ba-pin', start: 'top top', end: '+=140%', pin: true, scrub: 1, anticipatePin: 1 } });

  // шаги: линия дорисовывается, кружки загораются
  const sp = { v: 0 };
  gsap.to(sp, { v: 1, ease: 'none', onUpdate: () => setSteps(sp.v), scrollTrigger: { trigger: '.steps-wrap', start: 'top 78%', end: 'bottom 62%', scrub: .9 } });

  if (fine) {
    // кнопки «притягиваются» к курсору
    $$('.magnet').forEach(el => {
      const x = gsap.quickTo(el, 'x', { duration: .5, ease: 'power3' }), y = gsap.quickTo(el, 'y', { duration: .5, ease: 'power3' });
      el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); x((e.clientX - r.left - r.width / 2) * .25); y((e.clientY - r.top - r.height / 2) * .35); });
      el.addEventListener('pointerleave', () => { x(0); y(0); });
    });
    // карточки наклоняются, по ним бежит блик
    $$('.tilt').forEach(el => {
      gsap.set(el, { transformPerspective: 900 });
      const rx = gsap.quickTo(el, 'rotationX', { duration: .6, ease: 'power3' }), ry = gsap.quickTo(el, 'rotationY', { duration: .6, ease: 'power3' });
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--mx', px * 100 + '%'); el.style.setProperty('--my', py * 100 + '%');
        ry((px - .5) * 10); rx((.5 - py) * 10);
      });
      el.addEventListener('pointerleave', () => { rx(0); ry(0); });
    });
    // плашки и звёздочки следуют за мышью, за курсором — мыльные пузыри
    const hero = $('.hero');
    const movers = $$('[data-depth]', hero).map(el => ({ k: +el.dataset.depth, x: gsap.quickTo(el, 'x', { duration: 1, ease: 'power3' }), y: gsap.quickTo(el, 'y', { duration: 1, ease: 'power3' }) }));
    let last = 0, alive = 0;
    hero.addEventListener('pointermove', e => {
      const nx = e.clientX / innerWidth - .5, ny = e.clientY / innerHeight - .5;
      movers.forEach(m => { m.x(nx * m.k); m.y(ny * m.k); });
      const now = performance.now();
      if (now - last < 55 || alive > 24) return;
      last = now; alive++;
      const b = document.createElement('i'), s = 8 + Math.random() * 16;
      b.className = 'trail';
      b.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;width:${s}px;height:${s}px`;
      b.addEventListener('animationend', () => { b.remove(); alive--; });
      document.body.append(b);
    });
  }
  ScrollTrigger.sort?.();
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
} else {
  setSteps(1);
}

heroIn();
