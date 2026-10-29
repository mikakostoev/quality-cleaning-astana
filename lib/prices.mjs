/** Price formatting and the sentences that must stay in sync with the price list. */

export function fmt(n) {
  const v = Math.round(Number(n));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function perM2(n) {
  return `${fmt(n)} ₸/м²`;
}

export function tenge(n) {
  return `${fmt(n)} ₸`;
}

export function cheapestPerM2(prices) {
  return Math.min(prices.wet, prices.general, prices.renovation, prices.moveout);
}

export function cheapestAppliance(prices) {
  return Math.min(prices.fridge, prices.hood, prices.oven, prices.microwave);
}

/** Visible FAQ answer and FAQPage text. Matches the original copy when prices are unchanged. */
export function priceAnswer(prices, tail) {
  const reno = prices.renovation === prices.moveout
    ? `после ремонта и перед заселением — от ${perM2(prices.renovation)}`
    : `после ремонта — от ${perM2(prices.renovation)}, перед заселением — от ${perM2(prices.moveout)}`;
  const example = 60 * prices.general;
  return `Влажная — от ${perM2(prices.wet)}, генеральная — от ${perM2(prices.general)}, ${reno}. Например, генеральная уборка квартиры 60 м² — от ${tenge(example)}. Химчистка — от ${tenge(prices.chem)}, мойка б/у техники — от ${tenge(cheapestAppliance(prices))}. ${tail}`;
}

export function seoDescription(content) {
  const p = content.prices;
  const reno = p.renovation === p.moveout
    ? `после ремонта от ${fmt(p.renovation)}`
    : `после ремонта от ${fmt(p.renovation)}, перед заселением от ${fmt(p.moveout)}`;
  return `Клининг в Астане: влажная уборка от ${perM2(p.wet)}, генеральная от ${fmt(p.general)}, ${reno}. ${content.seo.descriptionTail}`;
}

export function ogDescription(content) {
  const p = content.prices;
  const reno = p.renovation === p.moveout
    ? `после ремонта от ${fmt(p.renovation)}`
    : `после ремонта от ${fmt(p.renovation)}, перед заселением от ${fmt(p.moveout)}`;
  return `${content.seo.ogLead}: влажная от ${perM2(p.wet)}, генеральная от ${fmt(p.general)}, ${reno}. ${content.seo.ogTail}`;
}

export function twitterDescription(content) {
  return `${content.seo.twitterLead} Влажная уборка от ${perM2(content.prices.wet)}. ${content.seo.twitterTail}`;
}

export function calcInitial(prices) {
  return fmt(60 * prices.wet);
}
