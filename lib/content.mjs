import { PRODUCTION_SITE_URL } from './jsonld.mjs';

const PRICE_KEYS = ['wet', 'general', 'renovation', 'moveout', 'chem', 'fridge', 'hood', 'oven', 'microwave'];
const SERVICE_IDS = ['wet', 'general', 'renovation', 'moveout'];

export class ContentError extends Error {
  constructor(errors) {
    super(errors.join('\n'));
    this.errors = errors;
  }
}

function str(errors, path, value, { min = 1, max = 500, allowEmpty = false } = {}) {
  if (typeof value !== 'string') {
    errors.push(`${path}: нужна строка`);
    return '';
  }
  const v = value.replace(/\r\n/g, '\n').trim();
  if (!allowEmpty && v.length < min) errors.push(`${path}: заполните поле`);
  if (v.length > max) errors.push(`${path}: слишком длинный текст (максимум ${max})`);
  if (/[<>]/.test(v) || v.includes('%%')) errors.push(`${path}: уберите символы < и >`);
  return v;
}

function price(errors, path, value) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isInteger(n) || n < 1 || n > 10_000_000) {
    errors.push(`${path}: укажите цену целым числом больше нуля`);
    return 0;
  }
  return n;
}

function intField(errors, path, value, min, max) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isInteger(n) || n < min || n > max) {
    errors.push(`${path}: укажите целое число от ${min} до ${max}`);
    return min;
  }
  return n;
}

export function normalizeContent(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ContentError(['Некорректные данные']);
  }

  const siteUrl = str(errors, 'Адрес сайта', input.siteUrl || '', { max: 120 });
  if (siteUrl && siteUrl !== PRODUCTION_SITE_URL) errors.push('Адрес сайта менять нельзя');

  const brandIn = input.brand || {};
  const alternateIn = Array.isArray(brandIn.alternateName) ? brandIn.alternateName : [];
  if (alternateIn.length < 1 || alternateIn.length > 8) errors.push('Другие написания названия: от 1 до 8');
  const brand = {
    name: str(errors, 'Название компании', brandIn.name || '', { max: 80 }),
    alternateName: alternateIn.map((name, i) => str(errors, `Другое написание ${i + 1}`, name || '', { max: 80 })),
    slogan: str(errors, 'Слоган', brandIn.slogan || '', { max: 120 }),
    description: str(errors, 'Описание компании', brandIn.description || '', { max: 600 }),
  };

  const seoIn = input.seo || {};
  const seo = {
    title: str(errors, 'Заголовок страницы', seoIn.title || '', { max: 160 }),
    ogTitle: str(errors, 'Заголовок для соцсетей', seoIn.ogTitle || '', { max: 160 }),
    ogImageAlt: str(errors, 'Подпись к картинке в соцсетях', seoIn.ogImageAlt || '', { max: 180 }),
    twitterTitle: str(errors, 'Заголовок для X', seoIn.twitterTitle || '', { max: 160 }),
    descriptionTail: str(errors, 'Текст описания после цен', seoIn.descriptionTail || '', { max: 240 }),
    ogLead: str(errors, 'Начало описания для соцсетей', seoIn.ogLead || '', { max: 180 }),
    ogTail: str(errors, 'Конец описания для соцсетей', seoIn.ogTail || '', { max: 180 }),
    twitterLead: str(errors, 'Начало короткого описания', seoIn.twitterLead || '', { max: 180 }),
    twitterTail: str(errors, 'Конец короткого описания', seoIn.twitterTail || '', { max: 180 }),
  };

  const heroIn = input.hero || {};
  const h1In = Array.isArray(heroIn.h1) ? heroIn.h1 : [];
  if (h1In.length !== 4) errors.push('Заголовок на первом экране: ровно 4 строки');
  const hero = {
    pill: str(errors, 'Плашка на первом экране', heroIn.pill || '', { max: 80 }),
    h1: [0, 1, 2, 3].map((i) => str(errors, `Строка заголовка ${i + 1}`, h1In[i] || '', { max: 40 })),
    script: str(errors, 'Рукописная фраза', heroIn.script || '', { max: 80 }),
    lead1: str(errors, 'Первый абзац', heroIn.lead1 || '', { max: 300 }),
    lead2: str(errors, 'Второй абзац', heroIn.lead2 || '', { max: 300 }),
    leadStrong: str(errors, 'Выделенная фраза', heroIn.leadStrong || '', { max: 120 }),
    lead3: str(errors, 'Окончание фразы', heroIn.lead3 || '', { max: 120 }),
    imageAlt: str(errors, 'Подпись к фото на первом экране', heroIn.imageAlt || '', { max: 180 }),
  };

  const statsIn = input.stats || {};
  const rating = str(errors, 'Оценка', statsIn.rating || '', { max: 8 });
  if (rating && !/^\d{1,2}(\.\d)?$/.test(rating)) errors.push('Оценка: например 4.9');
  const stats = {
    rating,
    reviewCount: intField(errors, 'Число оценок', statsIn.reviewCount, 1, 1_000_000),
    years: intField(errors, 'Лет на рынке', statsIn.years, 1, 100),
    yearsLabel: str(errors, 'Подпись к стажу', statsIn.yearsLabel || '', { max: 40 }),
    ratingNote: str(errors, 'Подпись к оценке', statsIn.ratingNote || '', { max: 80 }),
    chipReviews: str(errors, 'Подпись к отзывам на фото', statsIn.chipReviews || '', { max: 80 }),
  };

  const contactsIn = input.contacts || {};
  const phonesIn = Array.isArray(contactsIn.phones) ? contactsIn.phones : [];
  if (phonesIn.length !== 2) errors.push('Нужны ровно два телефона');
  const phones = [0, 1].map((i) => {
    const raw = phonesIn[i] || {};
    const tel = String(raw.tel || '').replace(/[\s()-]/g, '');
    if (!/^\+7\d{10}$/.test(tel)) errors.push(`Телефон ${i + 1}: формат +7 и 10 цифр, например +77779527961`);
    return {
      tel,
      display: str(errors, `Телефон ${i + 1} как на сайте`, raw.display || '', { max: 40 }),
      whatsapp: !!raw.whatsapp,
    };
  });
  if (phones.filter((phone) => phone.whatsapp).length !== 1) {
    errors.push('Отметьте ровно один номер для WhatsApp');
  }
  const geoIn = contactsIn.geo || {};
  const latitude = Number(geoIn.latitude);
  const longitude = Number(geoIn.longitude);
  if (!Number.isFinite(latitude) || latitude < 50 || latitude > 52) errors.push('Широта повреждена');
  if (!Number.isFinite(longitude) || longitude < 70 || longitude > 73) errors.push('Долгота повреждена');
  const instagram = str(errors, 'Instagram', contactsIn.instagram || '', { max: 160 });
  if (instagram && !/^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/.test(instagram)) {
    errors.push('Instagram: вставьте ссылку на профиль, например https://www.instagram.com/qualiti_cleaning_company/');
  }
  const gis = str(errors, 'Ссылка 2ГИС', contactsIn.gis || '', { max: 160 });
  if (gis && !/^https:\/\/2gis\.kz\/[A-Za-z0-9/_-]+$/.test(gis)) errors.push('Ссылка 2ГИС должна начинаться с https://2gis.kz/');
  const email = str(errors, 'Почта', contactsIn.email || '', { max: 120 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Почта выглядит неверно');
  const contacts = {
    phones,
    email,
    addressLine: str(errors, 'Адрес на сайте', contactsIn.addressLine || '', { max: 160 }),
    streetAddress: str(errors, 'Улица и дом', contactsIn.streetAddress || '', { max: 120 }),
    locality: str(errors, 'Город', contactsIn.locality || '', { max: 60 }),
    postalCode: str(errors, 'Индекс', contactsIn.postalCode || '', { max: 16 }),
    hours: str(errors, 'Часы работы', contactsIn.hours || '', { max: 160 }),
    instagram,
    gis,
    payment: str(errors, 'Способы оплаты', contactsIn.payment || '', { max: 80 }),
    geo: { latitude, longitude },
  };

  const pricesIn = input.prices || {};
  const prices = {};
  for (const key of PRICE_KEYS) prices[key] = price(errors, `Цена ${key}`, pricesIn[key]);

  const servicesIn = Array.isArray(input.services) ? input.services : [];
  if (servicesIn.length !== 4) errors.push('Должно быть 4 основные услуги');
  const services = SERVICE_IDS.map((id, i) => {
    const raw = servicesIn[i] || {};
    if (raw.id !== id) errors.push(`Услуга ${i + 1}: не меняйте тип`);
    return {
      id,
      title: str(errors, `Название услуги ${i + 1}`, raw.title || '', { max: 80 }),
      offerName: str(errors, `Название для Google, услуга ${i + 1}`, raw.offerName || '', { max: 80 }),
      card: str(errors, `Описание услуги ${i + 1}`, raw.card || '', { max: 400 }),
      offer: str(errors, `Краткое описание для Google, услуга ${i + 1}`, raw.offer || '', { max: 240 }),
      calcShort: str(errors, `Подпись в калькуляторе, услуга ${i + 1}`, raw.calcShort || '', { max: 40 }),
      calcName: str(errors, `Название в WhatsApp, услуга ${i + 1}`, raw.calcName || '', { max: 80 }),
    };
  });

  const extrasIn = Array.isArray(input.extras) ? input.extras : [];
  if (extrasIn.length !== 6) errors.push('Должно быть 6 дополнительных услуг');
  const extras = extrasIn.map((raw, i) => {
    const extra = {
      title: str(errors, `Доп. услуга ${i + 1}, название`, raw?.title || '', { max: 80 }),
      text: str(errors, `Доп. услуга ${i + 1}, текст`, raw?.text || '', { max: 240 }),
    };
    if (i === 4) {
      extra.priceKey = 'chem';
      extra.offer = str(errors, 'Химчистка, краткое описание для Google', raw?.offer || '', { max: 240 });
      extra.calcShort = str(errors, 'Химчистка в калькуляторе', raw?.calcShort || '', { max: 40 });
    }
    return extra;
  });

  const facadeIn = input.facade || {};
  const facade = {
    title: str(errors, 'Мойка фасадов, название', facadeIn.title || '', { max: 80 }),
    text: str(errors, 'Мойка фасадов, текст', facadeIn.text || '', { max: 160 }),
  };

  const unpricedIn = Array.isArray(input.unpriced) ? input.unpriced : [];
  if (unpricedIn.length < 1 || unpricedIn.length > 8) errors.push('Услуги без цены: от 1 до 8');
  const unpriced = unpricedIn.map((raw, i) => ({
    name: str(errors, `Услуга без цены ${i + 1}`, raw?.name || '', { max: 80 }),
    description: str(errors, `Описание услуги без цены ${i + 1}`, raw?.description || '', { max: 300 }),
  }));

  const bizIn = input.business || {};
  const business = {
    title: str(errors, 'Заголовок для организаций', bizIn.title || '', { max: 80 }),
    lead: str(errors, 'Текст для организаций', bizIn.lead || '', { max: 500 }),
    example: str(errors, 'Пример для организаций', bizIn.example || '', { max: 300 }),
  };
  const devIn = input.developers || {};
  const developers = {
    title: str(errors, 'Заголовок для застройщиков', devIn.title || '', { max: 80 }),
    lead: str(errors, 'Текст для застройщиков', devIn.lead || '', { max: 500 }),
  };

  if (input.works != null && !Array.isArray(input.works)) errors.push('Фото работ: некорректный список');
  const worksIn = Array.isArray(input.works) ? input.works : [];
  if (worksIn.length > 24) errors.push('Фото работ: не больше 24 пар');
  const workIds = new Set();
  const works = worksIn.map((raw, i) => {
    const id = String(raw?.id || '').trim();
    if (!/^[a-f0-9]{12}$/.test(id)) errors.push(`Работа ${i + 1}: загрузите фото ещё раз`);
    else if (workIds.has(id)) errors.push(`Работа ${i + 1}: такая карточка уже есть`);
    else workIds.add(id);
    const revRaw = raw?.rev == null ? 1 : raw.rev;
    const rev = Number(revRaw);
    if (!Number.isInteger(rev) || rev < 1 || rev > 9999) errors.push(`Работа ${i + 1}: обновите страницу и загрузите фото ещё раз`);
    return {
      id,
      caption: str(errors, `Подпись к работе ${i + 1}`, raw?.caption || '', { max: 80 }),
      portrait: raw?.portrait === true,
      rev: Number.isInteger(rev) ? rev : 1,
    };
  });

  const faqIn = input.faq || {};
  const itemsIn = Array.isArray(faqIn.items) ? faqIn.items : [];
  if (itemsIn.length < 1 || itemsIn.length > 30) errors.push('Вопросы: от 1 до 30');
  const generated = itemsIn.filter((item) => item?.generated === 'prices');
  if (generated.length !== 1) errors.push('Должен остаться один вопрос, ответ на который собирается из цен');
  const faq = {
    priceTail: str(errors, 'Окончание ответа про цены', faqIn.priceTail || '', { max: 240 }),
    items: itemsIn.map((raw, i) => {
      const q = str(errors, `Вопрос ${i + 1}`, raw?.q || '', { max: 180 });
      if (raw?.generated === 'prices') return { q, generated: 'prices' };
      return { q, a: str(errors, `Ответ ${i + 1}`, raw?.a || '', { max: 2000 }) };
    }),
  };

  const reviewsIn = input.reviews || {};
  const rowsIn = Array.isArray(reviewsIn.rows) ? reviewsIn.rows : [];
  if (rowsIn.length !== 2) errors.push('Нужны две ленты отзывов');
  const reviews = {
    linkText: str(errors, 'Ссылка на отзывы', reviewsIn.linkText || '', { max: 80 }),
    rows: [0, 1].map((rowIndex) => {
      const row = Array.isArray(rowsIn[rowIndex]) ? rowsIn[rowIndex] : [];
      if (row.length < 1 || row.length > 30) errors.push(`Лента отзывов ${rowIndex + 1}: от 1 до 30`);
      return row.map((raw, i) => ({
        name: str(errors, `Отзыв ${rowIndex + 1}.${i + 1}, имя`, raw?.name || '', { max: 80 }),
        initial: str(errors, `Отзыв ${rowIndex + 1}.${i + 1}, буква`, raw?.initial || '', { max: 2 }),
        meta: str(errors, `Отзыв ${rowIndex + 1}.${i + 1}, дата`, raw?.meta || '', { max: 80 }),
        text: str(errors, `Отзыв ${rowIndex + 1}.${i + 1}, текст`, raw?.text || '', { max: 1000 }),
      }));
    }),
  };

  const ctaIn = input.cta || {};
  const cta = {
    script: str(errors, 'Фраза перед контактами', ctaIn.script || '', { max: 80 }),
    title: str(errors, 'Заголовок перед контактами', ctaIn.title || '', { max: 80 }),
    titleEm: str(errors, 'Выделенное слово', ctaIn.titleEm || '', { max: 24 }),
  };
  const footerIn = input.footer || {};
  const footer = {
    line: str(errors, 'Строка в подвале', footerIn.line || '', { max: 160 }),
    tagline: str(errors, 'Подпись в подвале', footerIn.tagline || '', { max: 80 }),
  };

  if (errors.length) throw new ContentError(errors);
  return {
    siteUrl: PRODUCTION_SITE_URL,
    brand, seo, hero, stats, contacts, prices, services, extras, facade, unpriced,
    business, developers, works, faq, reviews, cta, footer,
  };
}

export function contentToJson(content) {
  return `${JSON.stringify(content, null, 2)}\n`;
}
