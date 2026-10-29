const $ = (sel, root = document) => root.querySelector(sel);
const gate = $('#gate');
const editor = $('#editor');
const loginForm = $('#login');
const loginMsg = $('#login-msg');
const setup = $('#setup');
const logoutBtn = $('#logout');

const PRICE_FIELDS = [
  ['wet', 'Влажная уборка', '₸ за м²'],
  ['general', 'Генеральная уборка', '₸ за м²'],
  ['renovation', 'После ремонта', '₸ за м²'],
  ['moveout', 'Перед заселением', '₸ за м²'],
  ['chem', 'Химчистка', '₸'],
  ['fridge', 'Холодильник', '₸'],
  ['hood', 'Вытяжка', '₸'],
  ['oven', 'Духовка с плитой', '₸'],
  ['microwave', 'Микроволновка', '₸'],
];

let content = null;
let dirty = false;

function h(tag, props, kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (key === 'class') node.className = value;
    else if (key === 'value') node.value = value;
    else node.setAttribute(key, value);
  }
  for (const kid of kids || []) node.append(kid?.nodeType ? kid : document.createTextNode(kid ?? ''));
  return node;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Admin': '1' },
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function field(label, value, onInput, { area = false, hint = '', inputmode = '' } = {}) {
  const input = h(area ? 'textarea' : 'input', area ? { rows: '4' } : { type: 'text', ...(inputmode ? { inputmode } : {}) });
  input.value = value ?? '';
  input.addEventListener('input', () => {
    dirty = true;
    onInput(input.value);
  });
  const box = h('label', {}, [label, input]);
  const wrap = h('div', { class: 'field' }, [box]);
  if (hint) wrap.append(h('p', { class: 'hint' }, [hint]));
  return wrap;
}

function section(title, nodes, open = false) {
  const details = h('details', { class: 'block', ...(open ? { open: '' } : {}) });
  details.append(h('summary', {}, [title]));
  details.append(h('div', { class: 'inner' }, nodes));
  return details;
}

function stringList(title, list, onChange, { addLabel }) {
  const box = h('div', { class: 'stack' });
  const draw = () => {
    box.replaceChildren();
    list.forEach((value, index) => {
      box.append(h('div', { class: 'item' }, [
        field(title, value, (next) => { list[index] = next; }),
        h('div', { class: 'row' }, [
          h('button', { class: 'ghost', type: 'button' }, ['Выше']),
          h('button', { class: 'ghost', type: 'button' }, ['Ниже']),
          h('button', { class: 'danger', type: 'button' }, ['Удалить']),
        ]),
      ]));
      const buttons = box.lastChild.querySelectorAll('button');
      buttons[0].onclick = () => { if (index === 0) return; [list[index - 1], list[index]] = [list[index], list[index - 1]]; dirty = true; onChange(); };
      buttons[1].onclick = () => { if (index === list.length - 1) return; [list[index + 1], list[index]] = [list[index], list[index + 1]]; dirty = true; onChange(); };
      buttons[2].onclick = () => { list.splice(index, 1); dirty = true; onChange(); };
    });
    box.append(h('button', { class: 'ghost', type: 'button' }, [addLabel]));
    box.lastChild.onclick = () => { list.push(''); dirty = true; onChange(); };
  };
  draw();
  return { box, draw };
}

function renderEditor(warning) {
  editor.replaceChildren();
  if (warning) editor.append(h('p', { class: 'msg bad' }, [warning]));
  const prices = h('div', { class: 'price-grid' });
  for (const [key, label, unit] of PRICE_FIELDS) {
    const input = h('input', { type: 'text', inputmode: 'numeric', value: String(content.prices[key]) });
    const preview = h('p', { class: 'hint' }, []);
    const paint = () => {
      const n = Number(input.value.trim());
      preview.textContent = Number.isInteger(n) && n > 0
        ? (key === 'wet' || key === 'general' || key === 'renovation' || key === 'moveout' ? `На сайте: от ${n.toLocaleString('ru-RU')} ₸/м²` : `На сайте: от ${n.toLocaleString('ru-RU')} ₸`)
        : 'Введите целое число больше нуля';
    };
    input.addEventListener('focus', () => input.select());
    input.addEventListener('input', () => {
      dirty = true;
      const n = Number(input.value.trim());
      if (Number.isInteger(n) && n > 0) content.prices[key] = n;
      paint();
    });
    paint();
    prices.append(h('label', {}, [label, input, preview, h('span', { class: 'hint' }, [unit])]));
  }
  editor.append(section('Цены', [
    h('p', { class: 'hint' }, ['Эти цифры попадут на карточки услуг, в калькулятор, в ответы на вопросы и в данные для Google.']),
    prices,
  ], true));

  const phoneNodes = content.contacts.phones.map((phone, index) => {
    const box = h('div', { class: 'item' }, [
      field(`Телефон ${index + 1} для ссылки`, phone.tel, (value) => { phone.tel = value.replace(/[\s()-]/g, ''); }, { hint: 'Формат +7 и 10 цифр, без пробелов. Пример: +77779527961' }),
      field('Как показать на сайте', phone.display, (value) => { phone.display = value; }, { hint: 'Пример: +7 777 952 7961' }),
    ]);
    const radio = h('input', { type: 'radio', name: 'wa' });
    radio.checked = phone.whatsapp;
    radio.addEventListener('change', () => {
      content.contacts.phones.forEach((item, i) => { item.whatsapp = i === index; });
      dirty = true;
    });
    box.append(h('label', { class: 'checks' }, [radio, 'Сюда приходят сообщения WhatsApp']));
    return box;
  });
  editor.append(section('Телефоны и контакты', [
    ...phoneNodes,
    field('Почта', content.contacts.email, (value) => { content.contacts.email = value; }),
    field('Адрес на сайте', content.contacts.addressLine, (value) => { content.contacts.addressLine = value; }),
    field('Улица и дом для карт', content.contacts.streetAddress, (value) => { content.contacts.streetAddress = value; }),
    field('Город', content.contacts.locality, (value) => { content.contacts.locality = value; }),
    field('Индекс', content.contacts.postalCode, (value) => { content.contacts.postalCode = value; }),
    field('Часы работы', content.contacts.hours, (value) => { content.contacts.hours = value; }, { hint: 'Это текст для людей. Для Google по-прежнему указано: ежедневно и круглосуточно.' }),
    field('Способы оплаты', content.contacts.payment, (value) => { content.contacts.payment = value; }),
    field('Ссылка на Instagram', content.contacts.instagram, (value) => { content.contacts.instagram = value; }),
    field('Ссылка на 2ГИС', content.contacts.gis, (value) => { content.contacts.gis = value; }),
  ], true));

  editor.append(section('Первый экран', [
    field('Плашка', content.hero.pill, (value) => { content.hero.pill = value; }),
    field('Строка заголовка 1', content.hero.h1[0], (value) => { content.hero.h1[0] = value; }, { hint: 'Название. Четвёртая строка на сайте крупнее.' }),
    field('Строка заголовка 2', content.hero.h1[1], (value) => { content.hero.h1[1] = value; }),
    field('Строка заголовка 3', content.hero.h1[2], (value) => { content.hero.h1[2] = value; }),
    field('Строка заголовка 4', content.hero.h1[3], (value) => { content.hero.h1[3] = value; }),
    field('Рукописная фраза', content.hero.script, (value) => { content.hero.script = value; }),
    field('Первый абзац', content.hero.lead1, (value) => { content.hero.lead1 = value; }, { area: true }),
    field('Второй абзац', content.hero.lead2, (value) => { content.hero.lead2 = value; }, { area: true }),
    field('Выделенная фраза', content.hero.leadStrong, (value) => { content.hero.leadStrong = value; }),
    field('Окончание фразы', content.hero.lead3, (value) => { content.hero.lead3 = value; }),
    field('Подпись к большому фото', content.hero.imageAlt, (value) => { content.hero.imageAlt = value; }),
    field('Оценка', content.stats.rating, (value) => { content.stats.rating = value; }, { hint: 'Например 4.9. Стоит на первом экране, в блоке «Почему мы» и в отзывах.' }),
    field('Подпись к оценке', content.stats.ratingNote, (value) => { content.stats.ratingNote = value; }),
    field('Подпись у фото', content.stats.chipReviews, (value) => { content.stats.chipReviews = value; }),
    field('Число оценок', String(content.stats.reviewCount), (value) => { content.stats.reviewCount = Number(value); }, { inputmode: 'numeric' }),
    field('Лет на рынке', String(content.stats.years), (value) => { content.stats.years = Number(value); }, { inputmode: 'numeric' }),
    field('Подпись к стажу', content.stats.yearsLabel, (value) => { content.stats.yearsLabel = value; }),
  ]));

  const services = content.services.map((service, index) => h('div', { class: 'item' }, [
    h('p', { class: 'hint' }, [`Услуга ${index + 1}. Цена задаётся выше.`]),
    field('Название на карточке', service.title, (value) => { service.title = value; }),
    field('Название для Google', service.offerName, (value) => { service.offerName = value; }),
    field('Описание на карточке', service.card, (value) => { service.card = value; }, { area: true }),
    field('Кратко для Google', service.offer, (value) => { service.offer = value; }, { area: true }),
    field('Подпись в калькуляторе', service.calcShort, (value) => { service.calcShort = value; }),
    field('Название в сообщении WhatsApp', service.calcName, (value) => { service.calcName = value; }),
  ]));
  editor.append(section('Услуги', services));

  const extras = content.extras.map((extra, index) => h('div', { class: 'item' }, [
    field('Название', extra.title, (value) => { extra.title = value; }),
    field('Текст', extra.text, (value) => { extra.text = value; }, { area: true }),
    ...(extra.priceKey ? [
      field('Кратко для Google', extra.offer, (value) => { extra.offer = value; }),
      field('Коротко в калькуляторе', extra.calcShort, (value) => { extra.calcShort = value; }, { hint: 'Цена химчистки берётся из блока «Цены».' }),
    ] : []),
  ]));
  editor.append(section('Дополнительные услуги', [
    ...extras,
    h('div', { class: 'item' }, [
      field('Фасады, название', content.facade.title, (value) => { content.facade.title = value; }),
      field('Фасады, текст', content.facade.text, (value) => { content.facade.text = value; }),
    ]),
    ...content.unpriced.map((service) => h('div', { class: 'item' }, [
      h('p', { class: 'hint' }, ['Без цены на странице, но Google видит эту услугу.']),
      field('Название', service.name, (value) => { service.name = value; }),
      field('Описание', service.description, (value) => { service.description = value; }, { area: true }),
    ])),
  ]));

  const faqBox = h('div');
  const drawFaq = () => {
    faqBox.replaceChildren();
    content.faq.items.forEach((item, index) => {
      const buttons = h('div', { class: 'row' }, [
        h('button', { class: 'ghost', type: 'button' }, ['Выше']),
        h('button', { class: 'ghost', type: 'button' }, ['Ниже']),
      ]);
      if (item.generated !== 'prices') buttons.append(h('button', { class: 'danger', type: 'button' }, ['Удалить']));
      const kids = [
        field('Вопрос', item.q, (value) => { item.q = value; }),
        item.generated === 'prices'
          ? h('p', { class: 'hint' }, ['Ответ собирается из цен: влажная, генеральная, после ремонта, химчистка и техника.'])
          : field('Ответ', item.a, (value) => { item.a = value; }, { area: true }),
        buttons,
      ];
      faqBox.append(h('div', { class: 'item' }, kids));
      const all = buttons.querySelectorAll('button');
      all[0].onclick = () => move(content.faq.items, index, -1, drawFaq);
      all[1].onclick = () => move(content.faq.items, index, 1, drawFaq);
      if (all[2]) all[2].onclick = () => { content.faq.items.splice(index, 1); dirty = true; drawFaq(); };
    });
    const add = h('button', { class: 'ghost', type: 'button' }, ['Добавить вопрос']);
    add.onclick = () => { content.faq.items.push({ q: '', a: '' }); dirty = true; drawFaq(); };
    faqBox.append(field('Последняя фраза в ответе про цены', content.faq.priceTail, (value) => { content.faq.priceTail = value; }, { area: true }));
    faqBox.append(add);
  };
  drawFaq();
  editor.append(section('Вопросы и ответы', [faqBox]));

  content.reviews.rows.forEach((row, rowIndex) => {
    const box = h('div');
    const draw = () => {
      box.replaceChildren();
      row.forEach((review, index) => {
        const item = h('div', { class: 'item' }, [
          field('Имя', review.name, (value) => { review.name = value; }),
          field('Буква в кружке', review.initial, (value) => { review.initial = value; }),
          field('Откуда и дата', review.meta, (value) => { review.meta = value; }, { hint: 'Например: 2ГИС, май 2026' }),
          field('Текст отзыва', review.text, (value) => { review.text = value; }, { area: true }),
          h('div', { class: 'row' }, [
            h('button', { class: 'ghost', type: 'button' }, ['Выше']),
            h('button', { class: 'ghost', type: 'button' }, ['Ниже']),
            h('button', { class: 'danger', type: 'button' }, ['Удалить']),
          ]),
        ]);
        const buttons = item.querySelectorAll('button');
        buttons[0].onclick = () => move(row, index, -1, draw);
        buttons[1].onclick = () => move(row, index, 1, draw);
        buttons[2].onclick = () => { row.splice(index, 1); dirty = true; draw(); };
        box.append(item);
      });
      const add = h('button', { class: 'ghost', type: 'button' }, ['Добавить отзыв']);
      add.onclick = () => { row.push({ name: '', initial: '', meta: '', text: '' }); dirty = true; draw(); };
      box.append(add);
    };
    draw();
    const reviewNodes = rowIndex === 0
      ? [field('Текст ссылки на 2ГИС', content.reviews.linkText, (value) => { content.reviews.linkText = value; }), box]
      : [box];
    editor.append(section(`Отзывы, лента ${rowIndex + 1}`, reviewNodes));
  });

  editor.append(section('Организации и застройщики', [
    field('Заголовок для организаций', content.business.title, (value) => { content.business.title = value; }),
    field('Текст для организаций', content.business.lead, (value) => { content.business.lead = value; }, { area: true }),
    field('Пример', content.business.example, (value) => { content.business.example = value; }, { area: true }),
    field('Заголовок для застройщиков', content.developers.title, (value) => { content.developers.title = value; }),
    field('Текст для застройщиков', content.developers.lead, (value) => { content.developers.lead = value; }, { area: true }),
  ]));

  const names = stringList('Написание', content.brand.alternateName, () => renderEditor(warning), { addLabel: 'Добавить написание' });
  editor.append(section('Название, подвал и поиск', [
    field('Полное название', content.brand.name, (value) => { content.brand.name = value; }),
    h('p', { class: 'hint' }, ['Другие написания видит Google. Первая строка заголовка и строка внизу страницы правятся отдельно.']),
    names.box,
    field('Слоган', content.brand.slogan, (value) => { content.brand.slogan = value; }),
    field('Описание компании', content.brand.description, (value) => { content.brand.description = value; }, { area: true }),
    field('Строка внизу страницы', content.footer.line, (value) => { content.footer.line = value; }),
    field('Подпись внизу', content.footer.tagline, (value) => { content.footer.tagline = value; }),
    field('Фраза перед контактами', content.cta.script, (value) => { content.cta.script = value; }),
    field('Заголовок перед контактами', content.cta.title, (value) => { content.cta.title = value; }),
    field('Выделенное слово', content.cta.titleEm, (value) => { content.cta.titleEm = value; }),
    field('Заголовок вкладки', content.seo.title, (value) => { content.seo.title = value; }),
    field('Заголовок, когда ссылку отправляют', content.seo.ogTitle, (value) => { content.seo.ogTitle = value; }),
    field('Короткий заголовок', content.seo.twitterTitle, (value) => { content.seo.twitterTitle = value; }),
    field('Подпись к картинке в соцсетях', content.seo.ogImageAlt, (value) => { content.seo.ogImageAlt = value; }),
    field('Текст после цен в описании', content.seo.descriptionTail, (value) => { content.seo.descriptionTail = value; }, { area: true, hint: 'Цены в описании для Google подставятся сами.' }),
    field('Начало описания для соцсетей', content.seo.ogLead, (value) => { content.seo.ogLead = value; }),
    field('Конец описания для соцсетей', content.seo.ogTail, (value) => { content.seo.ogTail = value; }),
    field('Начало короткого описания', content.seo.twitterLead, (value) => { content.seo.twitterLead = value; }),
    field('Конец короткого описания', content.seo.twitterTail, (value) => { content.seo.twitterTail = value; }),
  ]));

  const status = h('p', { class: 'msg', role: 'status' }, ['']);
  const publish = h('button', { class: 'primary', type: 'button' }, ['Опубликовать на сайт']);
  publish.onclick = async () => {
    status.className = 'msg';
    status.textContent = 'Публикуем…';
    publish.disabled = true;
    const result = await api('/api/admin/content', { method: 'PUT', body: { content } });
    publish.disabled = false;
    if (!result.ok) {
      status.className = 'msg bad';
      status.textContent = result.data.fields?.length
        ? `${result.data.error}: ${result.data.fields.slice(0, 4).join('; ')}`
        : (result.data.error || 'Не получилось сохранить');
      return;
    }
    dirty = false;
    status.className = 'msg ok';
    status.textContent = result.data.message || 'Сохранено';
  };
  editor.append(h('div', { class: 'publish' }, [publish, status]));
  logoutBtn.hidden = false;
  gate.hidden = true;
  editor.hidden = false;
}

function move(list, index, dir, redraw) {
  const next = index + dir;
  if (next < 0 || next >= list.length) return;
  [list[index], list[next]] = [list[next], list[index]];
  dirty = true;
  redraw();
}

async function enter() {
  const result = await api('/api/admin/content');
  if (result.status === 503) {
    loginForm.hidden = true;
    setup.hidden = false;
    setup.textContent = result.data.error || 'Админка не настроена';
    return;
  }
  if (result.status === 401) {
    gate.hidden = false;
    editor.hidden = true;
    logoutBtn.hidden = true;
    return;
  }
  if (!result.ok) {
    loginMsg.textContent = result.data.error || 'Не удалось открыть админку';
    loginMsg.className = 'msg bad';
    return;
  }
  content = result.data.content;
  renderEditor(result.data.warning);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMsg.textContent = 'Проверяем…';
  loginMsg.className = 'msg';
  const result = await api('/api/admin/login', { method: 'POST', body: { password: new FormData(loginForm).get('password') } });
  if (!result.ok) {
    loginMsg.textContent = result.data.error || 'Не удалось войти';
    loginMsg.className = 'msg bad';
    return;
  }
  loginForm.reset();
  loginMsg.textContent = '';
  await enter();
});

logoutBtn.addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST', body: {} });
  content = null;
  editor.hidden = true;
  editor.replaceChildren();
  gate.hidden = false;
  logoutBtn.hidden = true;
  loginForm.hidden = false;
});

addEventListener('beforeunload', (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

enter();
