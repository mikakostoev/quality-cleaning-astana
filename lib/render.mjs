import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyTokens, esc, jsonForScript, withBreaks } from './html.mjs';
import { worksBaTabs, worksGalleryHtml } from './works.mjs';
import { buildFaqPage, buildLocalBusiness, buildWebSite, faqItems } from './jsonld.mjs';
import { calcInitial, fmt, ogDescription, seoDescription, twitterDescription } from './prices.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function projectRoot() {
  const candidates = [process.cwd(), root];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'templates', 'index.html'))) return dir;
  }
  return root;
}

const STARS = '<span class="stars"><svg class="ic"><use href="#i-star"/></svg><svg class="ic"><use href="#i-star"/></svg><svg class="ic"><use href="#i-star"/></svg><svg class="ic"><use href="#i-star"/></svg><svg class="ic"><use href="#i-star"/></svg></span>';

export function waDigits(content) {
  const phone = content.contacts.phones.find((item) => item.whatsapp) || content.contacts.phones[0];
  return phone.tel.replace(/^\+/, '');
}

export function instagramHandle(url) {
  const match = String(url).match(/instagram\.com\/([^/?#]+)\/?$/);
  return match ? `@${match[1]}` : '';
}

function reviewsHtml(list) {
  return list.map((review) => (
    `      <figure class="rcard card">${STARS}<blockquote>${withBreaks(review.text)}</blockquote><figcaption><span class="ava">${esc(review.initial)}</span><span><b>${esc(review.name)}</b>${esc(review.meta)}</span></figcaption></figure>`
  )).join('\n');
}

function faqHtml(content) {
  return faqItems(content).map((item) => (
    `      <details><summary>${esc(item.q)}<i></i></summary><p>${withBreaks(item.a)}</p></details>`
  )).join('\n');
}

export function siteConfig(content) {
  const prices = {
    wet: content.prices.wet,
    general: content.prices.general,
    renovation: content.prices.renovation,
    moveout: content.prices.moveout,
  };
  const names = {};
  for (const service of content.services) names[service.id] = service.calcName;
  const chem = content.extras.find((extra) => extra.priceKey === 'chem');
  return {
    whatsapp: waDigits(content),
    prices,
    names,
    extras: { chem: content.prices.chem },
    chemLabel: chem.calcShort,
  };
}

export function tokensFrom(content) {
  const [phone1, phone2] = content.contacts.phones;
  const chem = content.extras.find((extra) => extra.priceKey === 'chem');
  const svc = Object.fromEntries(content.services.map((service) => [service.id, service]));
  const lead = `${esc(content.hero.lead1)}<br>${esc(content.hero.lead2)}<br><strong>${esc(content.hero.leadStrong)}</strong> ${esc(content.hero.lead3)}`;
  const tokens = {
    SEO_TITLE: esc(content.seo.title),
    SEO_DESCRIPTION: esc(seoDescription(content)),
    BRAND: esc(content.brand.name),
    OG_TITLE: esc(content.seo.ogTitle),
    OG_DESCRIPTION: esc(ogDescription(content)),
    OG_IMAGE_ALT: esc(content.seo.ogImageAlt),
    TW_TITLE: esc(content.seo.twitterTitle),
    TW_DESCRIPTION: esc(twitterDescription(content)),
    LD_BUSINESS: jsonForScript(buildLocalBusiness(content), 1),
    LD_FAQ: jsonForScript(buildFaqPage(content), 1),
    LD_WEBSITE: jsonForScript(buildWebSite(content), 1),
    SITE_CONFIG: jsonForScript(siteConfig(content)),
    HERO_PILL: esc(content.hero.pill),
    H1_1: esc(content.hero.h1[0]),
    H1_2: esc(content.hero.h1[1]),
    H1_3: esc(content.hero.h1[2]),
    H1_4: esc(content.hero.h1[3]),
    HERO_SCRIPT: esc(content.hero.script),
    HERO_LEAD: lead,
    HERO_ALT: esc(content.hero.imageAlt),
    RATING: esc(content.stats.rating),
    RATING_NOTE: esc(content.stats.ratingNote),
    CHIP_REVIEWS: esc(content.stats.chipReviews),
    YEARS: esc(String(content.stats.years)),
    YEARS_LABEL: esc(content.stats.yearsLabel),
    STAT_COUNT: esc(String(content.stats.reviewCount)),
    PHONE1: esc(phone1.tel),
    PHONE1_DISPLAY: esc(phone1.display),
    PHONE2: esc(phone2.tel),
    PHONE2_DISPLAY: esc(phone2.display),
    WA: esc(waDigits(content)),
    EMAIL: esc(content.contacts.email),
    GIS: esc(content.contacts.gis),
    GIS_REVIEWS: esc(`${content.contacts.gis}/tab/reviews`),
    INSTAGRAM_URL: esc(content.contacts.instagram),
    INSTAGRAM_HANDLE: esc(instagramHandle(content.contacts.instagram)),
    ADDRESS_LINE: esc(content.contacts.addressLine),
    HOURS: esc(content.contacts.hours),
    PAYMENT: esc(content.contacts.payment),
    PRICE_WET: fmt(content.prices.wet),
    PRICE_GENERAL: fmt(content.prices.general),
    PRICE_RENOVATION: fmt(content.prices.renovation),
    PRICE_MOVEOUT: fmt(content.prices.moveout),
    CHEM_FMT: fmt(content.prices.chem),
    CHEM_RAW: String(content.prices.chem),
    CHEM_SHORT: esc(chem.calcShort),
    CHEM_VALUE: esc(chem.title),
    PRICE_FRIDGE: fmt(content.prices.fridge),
    PRICE_HOOD: fmt(content.prices.hood),
    PRICE_OVEN: fmt(content.prices.oven),
    PRICE_MICRO: fmt(content.prices.microwave),
    CALC_INITIAL: calcInitial(content.prices),
    SVC_WET_TITLE: esc(svc.wet.title),
    SVC_WET_CARD: withBreaks(svc.wet.card),
    SVC_GENERAL_TITLE: esc(svc.general.title),
    SVC_GENERAL_CARD: withBreaks(svc.general.card),
    SVC_RENOVATION_TITLE: esc(svc.renovation.title),
    SVC_RENOVATION_CARD: withBreaks(svc.renovation.card),
    SVC_MOVEOUT_TITLE: esc(svc.moveout.title),
    SVC_MOVEOUT_CARD: withBreaks(svc.moveout.card),
    CALC_WET: esc(svc.wet.calcShort),
    CALC_GENERAL: esc(svc.general.calcShort),
    CALC_RENOVATION: esc(svc.renovation.calcShort),
    CALC_MOVEOUT: esc(svc.moveout.calcShort),
    B2B_TITLE: esc(content.business.title),
    B2B_LEAD: withBreaks(content.business.lead),
    B2B_EXAMPLE: withBreaks(content.business.example),
    DEV_TITLE: esc(content.developers.title),
    DEV_LEAD: withBreaks(content.developers.lead),
    FAQ_HTML: faqHtml(content),
    REVIEWS_N1: String(content.reviews.rows[0].length),
    REVIEWS_1: reviewsHtml(content.reviews.rows[0]),
    REVIEWS_N2: String(content.reviews.rows[1].length),
    REVIEWS_2: reviewsHtml(content.reviews.rows[1]),
    REVIEWS_HEAD: esc(`${content.stats.reviewCount} оценок. Средняя —`),
    REVIEWS_LINK: esc(content.reviews.linkText),
    CTA_SCRIPT: esc(content.cta.script),
    CTA_H2: esc(content.cta.title),
    CTA_H2_EM: esc(content.cta.titleEm),
    FOOTER_LINE: esc(content.footer.line),
    FOOTER_TAGLINE: esc(content.footer.tagline),
    WORKS_GALLERY: worksGalleryHtml(content.works || []),
    WORKS_BA_TABS: worksBaTabs(content.works || []),
  };
  content.extras.forEach((extra, index) => {
    tokens[`EXTRA${index + 1}_TITLE`] = esc(extra.title);
    tokens[`EXTRA${index + 1}_TEXT`] = withBreaks(extra.text);
  });
  tokens.FACADE_TITLE = esc(content.facade.title);
  tokens.FACADE_TEXT = withBreaks(content.facade.text);
  return tokens;
}

export function renderPage(content, template) {
  return applyTokens(template, tokensFrom(content));
}

export function readTemplate(dir = projectRoot()) {
  return fs.readFileSync(path.join(dir, 'templates', 'index.html'), 'utf8');
}

export function renderSite(content, dir = projectRoot()) {
  return renderPage(content, readTemplate(dir));
}
