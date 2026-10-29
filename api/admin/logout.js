import { logout } from '../../lib/admin-api.mjs';
import { handle } from '../../lib/node-handler.mjs';

export default function handler(req, res) {
  return handle(req, res, logout);
}
