export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/** Plain text with line breaks the owner typed. */
export function withBreaks(value) {
  return String(value).split('\n').map((line) => esc(line)).join('<br>');
}

export function jsonForScript(value, space) {
  return JSON.stringify(value, null, space).replace(/[<>&]/g, (c) => ({
    '<': '\\u003c',
    '>': '\\u003e',
    '&': '\\u0026',
  }[c]));
}

export function applyTokens(template, tokens) {
  let html = template;
  const keys = Object.keys(tokens).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const token = `%%${key}%%`;
    const value = tokens[key];
    if (typeof value !== 'string') throw new Error(`token ${key} is not a string`);
    if (value.includes('%%')) throw new Error(`token ${key} contains %%`);
    if (!html.includes(token)) throw new Error(`template is missing ${token}`);
    html = html.split(token).join(value);
  }
  const left = html.match(/%%[A-Z0-9_]+%%/);
  if (left) throw new Error(`unreplaced ${left[0]}`);
  return html;
}
