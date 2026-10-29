import { ContentError } from './content.mjs';
import { esc } from './html.mjs';

const ID = /^[a-f0-9]{12}$/;
export const MAX_UPLOADS = 8;
export const MAX_IMAGE_BYTES = 260_000;
const MAX_UPLOAD_BYTES = 2_000_000;

export function workImagePath(id, side) {
  if (!ID.test(id) || (side !== 'before' && side !== 'after')) {
    throw Object.assign(new Error('bad work image'), { code: 'PATH' });
  }
  return `img/works/${id}-${side}.jpg`;
}

export function workImageSrc(id, side, rev = 1) {
  return `${workImagePath(id, side)}?v=${rev}`;
}

function tabLabel(caption) {
  const text = caption.trim();
  return text.length > 22 ? `${text.slice(0, 21)}…` : text;
}

export function worksGalleryHtml(works) {
  if (!works.length) return '';
  const tiles = works.map((work) => {
    const before = workImageSrc(work.id, 'before', work.rev);
    const after = workImageSrc(work.id, 'after', work.rev);
    return `      <button class="g-tile wide tall duo" type="button"><span data-l="До"><img decoding="async" src="${esc(before)}" alt="${esc(`${work.caption} до уборки`)}" loading="lazy"></span><span data-l="После"><img decoding="async" src="${esc(after)}" alt="${esc(`${work.caption} после уборки`)}" loading="lazy"></span><span class="cap">${esc(work.caption)}</span></button>`;
  }).join('\n');
  return `\n    <div class="gallery works-added" data-stagger>\n${tiles}\n    </div>`;
}

export function worksBaTabs(works) {
  if (!works.length) return '';
  return `\n${works.map((work) => {
    const note = `Реальная работа Quality Клининг: ${work.caption}.`;
    return `        <button type="button" aria-pressed="false" data-ba="w-${work.id}" data-before="${esc(workImageSrc(work.id, 'before', work.rev))}" data-after="${esc(workImageSrc(work.id, 'after', work.rev))}" data-portrait="${work.portrait ? '1' : '0'}" data-before-alt="${esc(`${work.caption} до уборки`)}" data-after-alt="${esc(`${work.caption} после уборки`)}" data-note="${esc(note)}">${esc(tabLabel(work.caption))}</button>`;
  }).join('\n')}`;
}

export function normalizeUploads(raw, works) {
  if (raw == null) return [];
  const errors = [];
  if (!Array.isArray(raw)) {
    throw new ContentError(['Фото: некорректные данные']);
  }
  if (raw.length > MAX_UPLOADS) {
    errors.push('За раз можно отправить не больше 8 фото. Опубликуйте их и добавьте ещё.');
  }
  const ids = new Set((works || []).map((work) => work.id));
  const seen = new Set();
  const uploads = [];
  let total = 0;
  raw.forEach((item, index) => {
    const id = String(item?.id || '');
    const side = item?.side;
    const label = `Фото ${index + 1}`;
    if (!ids.has(id) || (side !== 'before' && side !== 'after')) {
      errors.push(`${label}: не относится к карточке работы`);
      return;
    }
    const key = `${id}:${side}`;
    if (seen.has(key)) {
      errors.push(`${label}: такое фото уже есть`);
      return;
    }
    seen.add(key);
    const data = String(item?.data || '').replace(/\s/g, '');
    if (!data || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      errors.push(`${label}: файл повреждён`);
      return;
    }
    const buf = Buffer.from(data, 'base64');
    if (buf.length < 100 || buf.length > MAX_IMAGE_BYTES || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
      errors.push(`${label}: нужно сжатое фото JPEG`);
      return;
    }
    total += buf.length;
    uploads.push({ id, side, data: buf.toString('base64'), bytes: buf.length });
  });
  if (total > MAX_UPLOAD_BYTES) {
    errors.push('Фото вместе слишком большие. Опубликуйте меньшую порцию.');
  }
  if (errors.length) throw new ContentError(errors);
  return uploads;
}

export function assertWorksComplete(previousWorks, works, uploads) {
  const prev = new Set(previousWorks.map((work) => work.id));
  const have = new Set(uploads.map((upload) => `${upload.id}:${upload.side}`));
  const errors = [];
  for (const work of works) {
    for (const [side, label] of [['before', 'до'], ['after', 'после']]) {
      if (prev.has(work.id) || have.has(`${work.id}:${side}`)) continue;
      errors.push(`«${work.caption}»: добавьте фото «${label}»`);
    }
  }
  if (errors.length) throw new ContentError(errors);
}

export function workFileChanges(previousWorks, works, uploads) {
  const nextIds = new Set(works.map((work) => work.id));
  const files = uploads.map((upload) => ({
    path: workImagePath(upload.id, upload.side),
    content: upload.data,
    encoding: 'base64',
  }));
  for (const work of previousWorks) {
    if (nextIds.has(work.id)) continue;
    for (const side of ['before', 'after']) {
      files.push({ path: workImagePath(work.id, side), deleted: true });
    }
  }
  return files;
}
