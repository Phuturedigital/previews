import { chunk1 } from './with-content-1';
import { chunk2 } from './with-content-2';
import { chunk3 } from './with-content-3';
import { chunk4 } from './with-content-4';
import { chunk5 } from './with-content-5';
import { chunk6 } from './with-content-6';

export const config = { runtime: 'edge' };
const html = chunk1 + chunk2 + chunk3 + chunk4 + chunk5 + chunk6;

export default function handler() {
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  });
}
