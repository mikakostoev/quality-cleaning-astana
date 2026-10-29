import { getContent, putContent } from '../../lib/admin-api.mjs';
import { handle } from '../../lib/node-handler.mjs';

export default function handler(req, res) {
  const fn = req.method === 'PUT' ? putContent : getContent;
  return handle(req, res, fn);
}
