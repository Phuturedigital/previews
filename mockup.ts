// Vercel Edge Function: serves a mockup HTML file from Supabase Storage.
//
// URL pattern:
//   https://previews.phuturedigital.co.za/{slug}
//   → routed by vercel.json → /api/mockup?slug={slug}
//   → this function fetches the file from Storage and returns it as HTML
//
// Vercel Edge Runtime sets Content-Type correctly and doesn't strip headers,
// so the browser renders the page properly (unlike Supabase Edge Functions).

export const config = {
  runtime: 'edge',
};

const STORAGE_BASE = 'https://tunlqcdgqzcpevmhneap.supabase.co/storage/v1/object/public/mockups';

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let slug = url.searchParams.get('slug') ?? '';

  // The vercel.json rewrite passes slug as a query param, but in case
  // someone hits /api/mockup directly we also accept it from the path
  if (!slug) {
    const segments = url.pathname.split('/').filter(Boolean);
    slug = segments[segments.length - 1] ?? '';
  }

  slug = slug.replace(/\.html$/i, '');

  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return new Response(notFoundPage('Invalid mockup slug'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const storageRes = await fetch(`${STORAGE_BASE}/${slug}.html`, {
    cf: { cacheTtl: 300 },
  } as RequestInit);

  if (!storageRes.ok) {
    return new Response(notFoundPage(`Mockup not found: ${slug}`), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const html = await storageRes.text();

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  });
}

function notFoundPage(message: string): string {
  const safe = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Not found — Phuture Digital</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #fafaf7; color: #0a0a0a; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { background: white; border: 0.5px solid rgba(0,0,0,0.08); border-radius: 14px; padding: 48px 40px; max-width: 480px; text-align: center; }
  .dot { width: 32px; height: 32px; background: #5b3aab; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; color: white; font-size: 16px; font-weight: 600; margin-bottom: 24px; }
  h1 { font-size: 22px; font-weight: 500; margin-bottom: 12px; }
  p { font-size: 15px; color: #555; line-height: 1.6; margin-bottom: 24px; }
  a { color: #5b3aab; font-size: 14px; text-decoration: none; font-weight: 500; }
</style>
</head>
<body>
<div class="card">
<div class="dot">P</div>
<h1>Mockup not found</h1>
<p>${safe}</p>
<a href="https://phuturedigital.co.za">Visit phuturedigital.co.za →</a>
</div>
</body>
</html>`;
}
