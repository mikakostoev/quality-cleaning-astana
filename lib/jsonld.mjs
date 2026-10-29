import { cheapestPerM2, perM2, priceAnswer } from './prices.mjs';

const SITE = 'https://quality-cleaning-astana.vercel.app/';

function faqText(item, content) {
  if (item.generated === 'prices') return priceAnswer(content.prices, content.faq.priceTail);
  return item.a;
}

export function faqItems(content) {
  return content.faq.items.map((item) => ({ q: item.q, a: faqText(item, content) }));
}

export function buildLocalBusiness(content) {
  const url = content.siteUrl;
  const priced = content.services.map((service) => ({
    '@type': 'Offer',
    itemOffered: {
      '@type': 'Service',
      name: service.offerName,
      description: service.offer,
      areaServed: content.contacts.locality,
    },
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      priceCurrency: 'KZT',
      price: content.prices[service.id],
      minPrice: content.prices[service.id],
      unitText: 'м²',
    },
  }));
  const chem = content.extras.find((extra) => extra.priceKey === 'chem');
  const chemOffer = {
    '@type': 'Offer',
    itemOffered: {
      '@type': 'Service',
      name: chem.title,
      description: chem.offer,
      areaServed: content.contacts.locality,
    },
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      priceCurrency: 'KZT',
      price: content.prices.chem,
      minPrice: content.prices.chem,
    },
  };
  const unpriced = content.unpriced.map((service) => ({
    '@type': 'Offer',
    itemOffered: {
      '@type': 'Service',
      name: service.name,
      description: service.description,
      areaServed: content.contacts.locality,
    },
  }));
  // Chem sits after the four per-m² services, matching the original catalog order.
  const offers = [...priced, chemOffer, ...unpriced];
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'ProfessionalService'],
    '@id': `${url}#business`,
    name: content.brand.name,
    alternateName: content.brand.alternateName,
    url,
    image: `${url}img/g-chandelier.jpg`,
    logo: `${url}img/logo.png`,
    slogan: content.brand.slogan,
    description: content.brand.description,
    telephone: content.contacts.phones.map((phone) => phone.tel),
    email: content.contacts.email,
    priceRange: `от ${perM2(cheapestPerM2(content.prices))}`,
    paymentAccepted: content.contacts.payment,
    currenciesAccepted: 'KZT',
    areaServed: { '@type': 'City', name: content.contacts.locality },
    address: {
      '@type': 'PostalAddress',
      streetAddress: content.contacts.streetAddress,
      addressLocality: content.contacts.locality,
      postalCode: content.contacts.postalCode,
      addressCountry: 'KZ',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: content.contacts.geo.latitude,
      longitude: content.contacts.geo.longitude,
    },
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '00:00',
      closes: '23:59',
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Услуги клининга в Астане',
      itemListElement: offers,
    },
    sameAs: [content.contacts.gis, content.contacts.instagram],
  };
}

export function buildFaqPage(content) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems(content).map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

export function buildWebSite(content) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: content.brand.name,
    url: content.siteUrl,
    inLanguage: 'ru',
  };
}

export const PRODUCTION_SITE_URL = SITE;
