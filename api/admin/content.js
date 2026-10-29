import { getContent, putContent } from '../../lib/admin-api.mjs';
import { handle } from '../../lib/node-handler.mjs';

export default function handler(req, res) {
  const fn = req.method === 'PUT' ? putContent : getContent;
  const maxBytes = req.method === 'PUT' ? 3_500_000 : 300_000;
  return handle(req, res, fn, { maxBytes });
}
