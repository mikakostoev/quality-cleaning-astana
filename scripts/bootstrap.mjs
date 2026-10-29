/**
 * One-shot: read the current static index.html and write content/site.json
 * plus templates/index.html. Do not run again after index.html is generated.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { priceAnswer } from '../lib/prices.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (html.includes('id="site-config"') || html.includes('%%SEO_TITLE%%')) {
  throw new Error('index.html is already generated from content. Edit content/site.json and templates/index.html.');
}

function once(source, from, to, label) {
  const at = source.indexOf(from);
  if (at < 0) throw new Error(`missing ${label || from.slice(0, 90)}`);
  if (source.indexOf(from, at + from.length) !== -1) throw new Error(`ambiguous ${label || from.slice(0, 90)}`);
  return source.slice(0, at) + to + source.slice(at + from.length);
}

function track(n) {
  const match = html.match(new RegExp(`<div class="mq-track" style="--n:${n}">\\n([\\s\\S]*?)\\n    </div>`));
  if (!match) throw new Error(`track ${n}`);
  return [...match[1].matchAll(/<blockquote>([\s\S]*?)<\/blockquote><figcaption><span class="ava">(.*?)<\/span><span><b>(.*?)<\/b>(.*?)<\/span><\/figcaption>/g)]
    .map((item) => ({ text: item[1], initial: item[2], name: item[3], meta: item[4] }));
}

const faqBlock = html.match(/<div class="faq-list" data-stagger>\n([\s\S]*?)\n    <\/div>/);
const faqRaw = [...faqBlock[1].matchAll(/<details><summary>(.*?)<i><\/i><\/summary><p>(.*?)<\/p><\/details>/g)]
  .map((item) => ({ q: item[1], a: item[2] }));

const prices = { wet: 400, general: 800, renovation: 850, moveout: 850, chem: 2000, fridge: 8000, hood: 7000, oven: 10000, microwave: 4000 };
const priceTail = 'Точную сумму менеджер назовёт после короткого описания или фото.';
if (faqRaw[0].a !== priceAnswer(prices, priceTail)) {
  console.error('GENERATED', priceAnswer(prices, priceTail));
  console.error('ORIGINAL ', faqRaw[0].a);
  throw new Error('price answer does not match the page');
}

const content = {
  siteUrl: 'https://quality-cleaning-astana.vercel.app/',
  brand: {
    name: 'Quality Клининг Company',
    alternateName: ['Quality Клининг', 'Quality Cleaning', 'Квалити Клининг', 'Quality Cleaning Astana'],
    slogan: 'Чисто. Быстро. Профессионально.',
    description: 'Клининговая компания в Астане: влажная и генеральная уборка, уборка после ремонта и перед заселением, мытьё окон и фасадов, химчистка мебели и ковров, уборка МОП в новостройках, обслуживание организаций по договору.',
  },
  seo: {
    title: 'Клининг в Астане — уборка квартир и офисов | Quality Клининг',
    ogTitle: 'Quality Клининг Company — профессиональная уборка в Астане',
    ogImageAlt: 'Клинер Quality Клининг моет хрустальную люстру',
    twitterTitle: 'Клининг в Астане — Quality Клининг Company',
    descriptionTail: 'Своё оборудование и химия, заявки 24/7, работаем по договору.',
    ogLead: 'Уборка квартир, домов и офисов в Астане',
    ogTail: 'Приезжаем со своим оборудованием.',
    twitterLead: 'Квартиры, дома, офисы.',
    twitterTail: 'Своё оборудование и химия.',
  },
  hero: {
    pill: 'Клининг в Астане · 7 лет опыта',
    h1: ['Quality Клининг', 'Профессиональная', 'уборка', 'в Астане'],
    script: 'Чистое пространство — счастливые люди!',
    lead1: 'Убираем квартиры, дома, коттеджи, офисы, медцентры, заводы и другие объекты.',
    lead2: 'Всё необходимое привозим с собой: парогенератор, пылесос, стремянку, профессиональную химию и инвентарь.',
    leadStrong: 'Вам остаётся только наслаждаться чистотой!',
    lead3: 'Работаем по договору.',
    imageAlt: 'Клинер Quality Клининг Company моет хрустальную люстру в Астане',
  },
  stats: {
    rating: '4.9',
    reviewCount: 306,
    years: 7,
    yearsLabel: 'в клининге',
    ratingNote: 'в 2ГИС · 500+ отзывов на разных площадках',
    chipReviews: '500+ отзывов клиентов',
  },
  contacts: {
    phones: [
      { tel: '+77779527961', display: '+7 777 952 7961', whatsapp: true },
      { tel: '+77013939449', display: '+7 701 393 9449', whatsapp: false },
    ],
    email: 'kacestvennaauborka8695@gmail.com',
    addressLine: 'проспект Мангилик Ел, 53, Есиль район, Астана',
    streetAddress: 'проспект Мангилик Ел, 53',
    locality: 'Астана',
    postalCode: 'Z05P1P4',
    hours: 'Круглосуточно, без выходных — по предварительной записи',
    instagram: 'https://www.instagram.com/qualiti_cleaning_company/',
    gis: 'https://2gis.kz/astana/firm/70000001059630800',
    payment: 'Карта, наличные, перевод',
    geo: { latitude: 51.094103, longitude: 71.42482 },
  },
  prices,
  services: [
    {
      id: 'wet',
      title: 'Влажная уборка',
      offerName: 'Влажная уборка',
      card: 'Поддерживающая уборка: пыль на всех доступных поверхностях, полы и плинтусы, кухня и санузел, вынос мусора.',
      offer: 'Поддерживающая уборка квартир и офисов',
      calcShort: 'Влажная',
      calcName: 'Влажная уборка',
    },
    {
      id: 'general',
      title: 'Генеральная уборка',
      offerName: 'Генеральная уборка',
      card: 'Все комнаты и тёплый балкон: окна с москитными сетками, люстры, радиаторы парогенератором, духовка и холодильник, санузел от пола до потолка.',
      offer: 'Все комнаты и балкон, окна, люстры, радиаторы, кухня и санузел',
      calcShort: 'Генеральная',
      calcName: 'Генеральная уборка',
    },
    {
      id: 'renovation',
      title: 'Уборка после ремонта',
      offerName: 'Уборка после ремонта',
      card: 'Строительная пыль, следы клея, эмульсии и цемента, свежие плёнки, мебель внутри и снаружи, вынос мусора до 5 кг.',
      offer: 'Удаление строительной пыли и следов затирки',
      calcShort: 'После ремонта',
      calcName: 'Уборка после ремонта',
    },
    {
      id: 'moveout',
      title: 'Перед заселением',
      offerName: 'Уборка перед заселением',
      card: 'Генеральная после прежних жильцов: все шкафы внутри и снаружи, кухня, техника и санузел — заезжаете в чистую квартиру.',
      offer: 'Генеральная уборка после прежних жильцов',
      calcShort: 'Перед заселением',
      calcName: 'Уборка после прежних жильцов',
    },
  ],
  extras: [
    { title: 'Мойка окон снаружи на любой высоте', text: 'Панорамные, витражные и двойные окна' },
    { title: 'Мытьё натяжных потолков', text: 'Аккуратно и без разводов' },
    { title: 'Стирка штор и тюля', text: 'Профессиональная стирка' },
    { title: 'Озонирование воздуха', text: 'Убирает запахи табака, гари, сырости, гнили и животных, уничтожает бактерии в воздухе' },
    {
      title: 'Химчистка мебели и ковров',
      text: 'Все виды мягкой мебели, ковры и ковровые покрытия — сухая и аква-чистка',
      priceKey: 'chem',
      offer: 'Сухая и аква-чистка, паровая обработка',
      calcShort: 'Химчистка',
    },
    { title: 'Полировка варочной поверхности', text: 'Вернём стеклокерамике блеск' },
  ],
  facade: {
    title: 'Мойка фасадов любой сложности',
    text: 'Работаем с промышленными альпинистами',
  },
  unpriced: [
    { name: 'Мойка окон и фасадов', description: 'Окна снаружи на любой высоте, фасады любой сложности, работа с промышленными альпинистами' },
    { name: 'Уборка МОП в новостройках', description: 'Подъезды, лестничные площадки и места общего пользования перед сдачей объекта' },
    { name: 'Обслуживание организаций по договору', description: 'Детские сады, бизнес-центры, офисы, медцентры, больницы' },
  ],
  business: {
    title: 'Обслуживание по договору',
    lead: 'Заключаем договоры на долгосрочное обслуживание детских садов, бизнес-центров, офисов, медцентров, больниц и других крупных организаций — уборка по согласованному графику.',
    example: 'Например, делали генеральную уборку Дворца единоборств имени Жаксылыка Ушкемпирова.',
  },
  developers: {
    title: 'Уборка МОП в новостройках',
    lead: 'Услуги уборки для строительных компаний и застройщиков. Моем подъезды, лестничные площадки и места общего пользования (МОП) в новостройках перед сдачей объекта.',
  },
  faq: {
    priceTail,
    items: faqRaw.map((item, index) => (index === 0 ? { q: item.q, generated: 'prices' } : { q: item.q, a: item.a })),
  },
  reviews: {
    linkText: 'Все 294 отзыва в 2ГИС →',
    rows: [track(13), track(12)],
  },
  cta: {
    script: 'С нами чисто всегда!',
    title: 'Закажите уборку — остальное мы сделаем',
    titleEm: 'сами',
  },
  footer: {
    line: '© 2026 Quality Клининг Company (Quality Cleaning) · Клининг в Астане',
    tagline: 'Чистота · Комфорт · Забота',
  },
};

let template = html;
template = template.replace(/<script type="application\/ld\+json">\n[\s\S]*?\n<\/script>/, '___LD___');
let ld = 0;
template = template.replace(/<script type="application\/ld\+json">\n[\s\S]*?\n<\/script>|___LD___/g, (match) => {
  const token = ['LD_BUSINESS', 'LD_FAQ', 'LD_WEBSITE'][ld++];
  if (match === '___LD___' || match.startsWith('<script type="application/ld+json">')) {
    return `<script type="application/ld+json">\n%%${token}%%\n</script>`;
  }
  return match;
});
if (ld !== 3) throw new Error(`ld count ${ld}`);

template = once(template, '<title>Клининг в Астане — уборка квартир и офисов | Quality Клининг</title>', '<title>%%SEO_TITLE%%</title>');
template = once(template, '<meta name="description" content="Клининг в Астане: влажная уборка от 400 ₸/м², генеральная от 800, после ремонта от 850. Своё оборудование и химия, заявки 24/7, работаем по договору.">', '<meta name="description" content="%%SEO_DESCRIPTION%%">');
template = once(template, '<meta property="og:site_name" content="Quality Клининг Company">', '<meta property="og:site_name" content="%%BRAND%%">');
template = once(template, '<meta property="og:title" content="Quality Клининг Company — профессиональная уборка в Астане">', '<meta property="og:title" content="%%OG_TITLE%%">');
template = once(template, '<meta property="og:description" content="Уборка квартир, домов и офисов в Астане: влажная от 400 ₸/м², генеральная от 800, после ремонта от 850. Приезжаем со своим оборудованием.">', '<meta property="og:description" content="%%OG_DESCRIPTION%%">');
template = once(template, '<meta property="og:image:alt" content="Клинер Quality Клининг моет хрустальную люстру">', '<meta property="og:image:alt" content="%%OG_IMAGE_ALT%%">');
template = once(template, '<meta name="twitter:title" content="Клининг в Астане — Quality Клининг Company">', '<meta name="twitter:title" content="%%TW_TITLE%%">');
template = once(template, '<meta name="twitter:description" content="Квартиры, дома, офисы. Влажная уборка от 400 ₸/м². Своё оборудование и химия.">', '<meta name="twitter:description" content="%%TW_DESCRIPTION%%">');
template = once(template, '<script src="app.js" defer></script>', '<script type="application/json" id="site-config">%%SITE_CONFIG%%</script>\n<script src="app.js" defer></script>');

template = template.replaceAll('https://wa.me/77779527961', 'https://wa.me/%%WA%%');
template = template.replaceAll('tel:+77779527961', 'tel:%%PHONE1%%');
template = template.replaceAll('+7 777 952 7961', '%%PHONE1_DISPLAY%%');
template = template.replaceAll('tel:+77013939449', 'tel:%%PHONE2%%');
template = template.replaceAll('+7 701 393 9449', '%%PHONE2_DISPLAY%%');
template = template.replaceAll('kacestvennaauborka8695@gmail.com', '%%EMAIL%%');
template = template.replaceAll('https://2gis.kz/astana/firm/70000001059630800/tab/reviews', '%%GIS_REVIEWS%%');
template = template.replaceAll('https://2gis.kz/astana/firm/70000001059630800', '%%GIS%%');
template = template.replaceAll('https://www.instagram.com/qualiti_cleaning_company/', '%%INSTAGRAM_URL%%');
template = template.replaceAll('@qualiti_cleaning_company', '%%INSTAGRAM_HANDLE%%');

template = once(template, '<a class="logo" href="#top" aria-label="Quality Клининг Company — на главную">', '<a class="logo" href="#top" aria-label="%%BRAND%% — на главную">');
template = template.replaceAll('alt="Quality Клининг Company"', 'alt="%%BRAND%%"');

template = once(template, '<span class="dot"></span>Клининг в Астане · 7 лет опыта</p>', '<span class="dot"></span>%%HERO_PILL%%</p>');
template = once(
  template,
  '<h1 data-hero><span class="line"><span>Quality Клининг</span></span><span class="line"><span>Профессиональная</span></span><span class="line"><span>уборка</span></span><span class="line big"><span>в Астане</span></span></h1>',
  '<h1 data-hero><span class="line"><span>%%H1_1%%</span></span><span class="line"><span>%%H1_2%%</span></span><span class="line"><span>%%H1_3%%</span></span><span class="line big"><span>%%H1_4%%</span></span></h1>',
);
template = once(template, '<p class="script" data-hero>Чистое пространство — счастливые люди! ', '<p class="script" data-hero>%%HERO_SCRIPT%% ');
template = template.replace(/<p class="hero-lead" data-hero>[\s\S]*?<\/p>/, '<p class="hero-lead" data-hero>%%HERO_LEAD%%</p>');
template = once(template, 'alt="Клинер Quality Клининг Company моет хрустальную люстру в Астане"', 'alt="%%HERO_ALT%%"');
template = once(template, '<span class="hero-rate"><b>4.9</b> в 2ГИС · 500+ отзывов на разных площадках</span>', '<span class="hero-rate"><b>%%RATING%%</b> %%RATING_NOTE%%</span>');
template = once(template, '<svg class="ic"><use href="#i-card"/></svg>Карта, наличные, перевод</li>', '<svg class="ic"><use href="#i-card"/></svg>%%PAYMENT%%</li>');
template = once(template, '<span><b>4.9</b><br>500+ отзывов клиентов</span>', '<span><b>%%RATING%%</b><br>%%CHIP_REVIEWS%%</span>');
template = once(template, '<b>7 лет</b><span>в клининге</span>', '<b>%%YEARS%% лет</b><span>%%YEARS_LABEL%%</span>');

template = once(template, '<h2>Обслуживание по договору</h2>', '<h2>%%B2B_TITLE%%</h2>');
template = once(template, '<p>Заключаем договоры на долгосрочное обслуживание детских садов, бизнес-центров, офисов, медцентров, больниц и других крупных организаций — уборка по согласованному графику.</p>', '<p>%%B2B_LEAD%%</p>');
template = once(template, '<p>Например, делали генеральную уборку Дворца единоборств имени Жаксылыка Ушкемпирова.</p>', '<p>%%B2B_EXAMPLE%%</p>');
template = once(template, '<h3 class="b2b-title">Уборка МОП в новостройках</h3>', '<h3 class="b2b-title">%%DEV_TITLE%%</h3>');
template = once(template, '<p>Услуги уборки для строительных компаний и застройщиков. Моем подъезды, лестничные площадки и места общего пользования (МОП) в новостройках перед сдачей объекта.</p>', '<p>%%DEV_LEAD%%</p>');

const cards = [
  ['Влажная уборка', 'Поддерживающая уборка: пыль на всех доступных поверхностях, полы и плинтусы, кухня и санузел, вынос мусора.', '400', 'SVC_WET_TITLE', 'SVC_WET_CARD', 'PRICE_WET'],
  ['Генеральная уборка', 'Все комнаты и тёплый балкон: окна с москитными сетками, люстры, радиаторы парогенератором, духовка и холодильник, санузел от пола до потолка.', '800', 'SVC_GENERAL_TITLE', 'SVC_GENERAL_CARD', 'PRICE_GENERAL'],
  ['Уборка после ремонта', 'Строительная пыль, следы клея, эмульсии и цемента, свежие плёнки, мебель внутри и снаружи, вынос мусора до 5 кг.', '850', 'SVC_RENOVATION_TITLE', 'SVC_RENOVATION_CARD', 'PRICE_RENOVATION'],
  ['Перед заселением', 'Генеральная после прежних жильцов: все шкафы внутри и снаружи, кухня, техника и санузел — заезжаете в чистую квартиру.', '850', 'SVC_MOVEOUT_TITLE', 'SVC_MOVEOUT_CARD', 'PRICE_MOVEOUT'],
];
for (const [title, card, price, titleToken, cardToken, priceToken] of cards) {
  template = once(
    template,
    `<h3>${title}</h3>\n        <p>${card}</p>\n        <span class="price">от <b>${price}</b> ₸/м²</span>`,
    `<h3>%%${titleToken}%%</h3>\n        <p>%%${cardToken}%%</p>\n        <span class="price">от <b>%%${priceToken}%%</b> ₸/м²</span>`,
  );
}

const extras = [
  ['Мойка окон снаружи на любой высоте', 'Панорамные, витражные и двойные окна', 1],
  ['Мытьё натяжных потолков', 'Аккуратно и без разводов', 2],
  ['Стирка штор и тюля', 'Профессиональная стирка', 3],
  ['Озонирование воздуха', 'Убирает запахи табака, гари, сырости, гнили и животных, уничтожает бактерии в воздухе', 4],
  ['Полировка варочной поверхности', 'Вернём стеклокерамике блеск', 6],
];
for (const [title, text, n] of extras) {
  template = once(template, `<h4>${title}</h4><p>${text}</p>`, `<h4>%%EXTRA${n}_TITLE%%</h4><p>%%EXTRA${n}_TEXT%%</p>`);
}
template = once(
  template,
  '<h4>Химчистка мебели и ковров</h4><p>Все виды мягкой мебели, ковры и ковровые покрытия — сухая и аква-чистка</p><span class="price">от <b>2 000</b> ₸</span>',
  '<h4>%%EXTRA5_TITLE%%</h4><p>%%EXTRA5_TEXT%%</p><span class="price">от <b>%%CHEM_FMT%%</b> ₸</span>',
);
template = once(
  template,
  '<h4>Мойка фасадов любой сложности</h4><p>Работаем с промышленными альпинистами</p>',
  '<h4>%%FACADE_TITLE%%</h4><p>%%FACADE_TEXT%%</p>',
);
template = once(
  template,
  '<ul class="tags"><li>Холодильник — <b>8 000 ₸</b></li><li>Вытяжка — <b>7 000 ₸</b></li><li>Духовой шкаф с плитой — <b>10 000 ₸</b></li><li>Микроволновка — <b>4 000 ₸</b></li></ul>',
  '<ul class="tags"><li>Холодильник — <b>%%PRICE_FRIDGE%% ₸</b></li><li>Вытяжка — <b>%%PRICE_HOOD%% ₸</b></li><li>Духовой шкаф с плитой — <b>%%PRICE_OVEN%% ₸</b></li><li>Микроволновка — <b>%%PRICE_MICRO%% ₸</b></li></ul>',
);
template = once(template, 'Химчистка мебели и ковров — <b>от 2 000 ₸</b>', 'Химчистка мебели и ковров — <b>от %%CHEM_FMT%% ₸</b>');
template = once(template, '<span class="price">от <b>2 000</b> ₸</span>\n        <button class="btn btn-primary magnet" type="button" data-chem>', '<span class="price">от <b>%%CHEM_FMT%%</b> ₸</span>\n        <button class="btn btn-primary magnet" type="button" data-chem>');

template = once(template, '<span>Влажная<small>от 400 ₸/м²</small></span>', '<span>%%CALC_WET%%<small>от %%PRICE_WET%% ₸/м²</small></span>');
template = once(template, '<span>Генеральная<small>от 800 ₸/м²</small></span>', '<span>%%CALC_GENERAL%%<small>от %%PRICE_GENERAL%% ₸/м²</small></span>');
template = once(template, '<span>После ремонта<small>от 850 ₸/м²</small></span>', '<span>%%CALC_RENOVATION%%<small>от %%PRICE_RENOVATION%% ₸/м²</small></span>');
template = once(template, '<span>Перед заселением<small>от 850 ₸/м²</small></span>', '<span>%%CALC_MOVEOUT%%<small>от %%PRICE_MOVEOUT%% ₸/м²</small></span>');
template = once(
  template,
  '<input type="checkbox" name="extra" value="Химчистка мебели и ковров" data-price="2000"><span>Химчистка <small>от 2 000 ₸</small></span>',
  '<input type="checkbox" name="extra" value="%%CHEM_VALUE%%" data-extra="chem" data-price="%%CHEM_RAW%%"><span>%%CHEM_SHORT%% <small>от %%CHEM_FMT%% ₸</small></span>',
);
template = once(template, '<output id="total">от 24 000 ₸</output>', '<output id="total">от %%CALC_INITIAL%% ₸</output>');

template = once(template, '<b data-count="4.9">4.9</b>', '<b data-count="%%RATING%%">%%RATING%%</b>');
template = once(template, '<b data-count="306">306</b>', '<b data-count="%%STAT_COUNT%%">%%STAT_COUNT%%</b>');
template = once(template, '<span data-count="7">7</span> лет</b><span>в клининге</span>', '<span data-count="%%YEARS%%">%%YEARS%%</span> лет</b><span>%%YEARS_LABEL%%</span>');

template = once(template, '<h2 data-split>306 оценок. Средняя — <em>4.9</em></h2>', '<h2 data-split>%%REVIEWS_HEAD%% <em>%%RATING%%</em></h2>');
template = once(template, '>Все 294 отзыва в 2ГИС →</span>', '>%%REVIEWS_LINK%%</span>');
template = template.replace(
  /<div class="mq-track" style="--n:13">\n[\s\S]*?\n    <\/div>/,
  '<div class="mq-track" style="--n:%%REVIEWS_N1%%">\n%%REVIEWS_1%%\n    </div>',
);
template = template.replace(
  /<div class="mq-track" style="--n:12">\n[\s\S]*?\n    <\/div>/,
  '<div class="mq-track" style="--n:%%REVIEWS_N2%%">\n%%REVIEWS_2%%\n    </div>',
);
template = template.replace(
  /<div class="faq-list" data-stagger>\n[\s\S]*?\n    <\/div>/,
  '<div class="faq-list" data-stagger>\n%%FAQ_HTML%%\n    </div>',
);

template = once(template, '<p class="script light" data-reveal>С нами чисто всегда! ', '<p class="script light" data-reveal>%%CTA_SCRIPT%% ');
template = once(template, '<h2 data-split>Закажите уборку — остальное мы сделаем <em>сами</em></h2>', '<h2 data-split>%%CTA_H2%% <em>%%CTA_H2_EM%%</em></h2>');
template = once(template, '<span>проспект Мангилик Ел, 53, Есиль район, Астана · <a href="%%GIS%%"', '<span>%%ADDRESS_LINE%% · <a href="%%GIS%%"');
template = once(template, '<svg class="ic"><use href="#i-clock"/></svg><span>Круглосуточно, без выходных — по предварительной записи</span>', '<svg class="ic"><use href="#i-clock"/></svg><span>%%HOURS%%</span>');
template = once(template, '<span>© 2026 Quality Клининг Company (Quality Cleaning) · Клининг в Астане</span>', '<span>%%FOOTER_LINE%%</span>');
template = once(template, '<span>Чистота · Комфорт · Забота</span>', '<span>%%FOOTER_TAGLINE%%</span>');

fs.mkdirSync(path.join(root, 'content'), { recursive: true });
fs.mkdirSync(path.join(root, 'templates'), { recursive: true });
fs.writeFileSync(path.join(root, 'content', 'site.json'), `${JSON.stringify(content, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'templates', 'index.html'), template);
console.log('wrote content and template', content.reviews.rows.map((row) => row.length).join('+'), 'reviews');
