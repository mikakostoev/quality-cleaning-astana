function headerMap(req) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers || {})) {
    headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return headers;
}

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    if (!req.body) return Promise.resolve({});
    return Promise.resolve(JSON.parse(req.body));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 300_000) {
        reject(Object.assign(new Error('too big'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(Object.assign(error, { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function send(res, result) {
  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  for (const [key, value] of Object.entries(result.headers || {})) res.setHeader(key, value);
  res.end(JSON.stringify(result.body));
}

export async function handle(req, res, fn) {
  try {
    const headers = headerMap(req);
    let body = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') body = await readBody(req);
    const result = await fn({
      method: req.method,
      headers,
      body,
      ip: String(headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim(),
      secure: headers['x-forwarded-proto'] === 'https' || process.env.VERCEL === '1',
      now: Date.now(),
    });
    send(res, result);
  } catch (error) {
    const status = error.status || 500;
    send(res, {
      status,
      body: { error: status === 413 ? 'Слишком большой запрос' : status === 400 ? 'Не удалось прочитать данные' : 'Ошибка сервера' },
    });
  }
}
