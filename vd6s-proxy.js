/**
 * Ywdown — vd6s.net API Proxy
 * ----------------------------------------------------
 * Deploy this as a Cloudflare Worker named "vd6s-proxy".
 * It proxies requests from your Ywdown site to vd6s.net's API,
 * bypassing the CORS restriction.
 *
 * The user solves Cloudflare Turnstile on YOUR site → token sent here →
 * forwarded to vd6s.net → response returned to your site.
 *
 * Endpoints:
 *   POST /analyze   → calls https://vd6s.net/mates/en/analyze/ajax
 *   POST /convert    → calls https://vd6s.net/mates/en/convert
 *   GET  /status     → calls https://vd6s.net/mates/en/convert/status
 */

const VD6S_BASE = 'https://vd6s.net';
const ALLOWED_ORIGINS = [
  'https://ywdown.pages.dev',
  'https://yowdown.pages.dev',
  'https://ywdown.ywdown.workers.dev',
  'http://localhost:8080',
  'http://localhost:8788'
];

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400'
  };
}

function jsonResponse(obj, status, origin, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
      ...(extraHeaders || {})
    }
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Health check
    if (url.pathname === '/' || url.pathname === '/ping') {
      return jsonResponse({ ok: true, service: 'vd6s-proxy', version: '1.0' }, 200, origin);
    }

    // Analyze: POST /analyze
    if (url.pathname === '/analyze' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { url: videoUrl, platform, mhash, cftoken, lang } = body;

        if (!videoUrl || !cftoken) {
          return jsonResponse({ error: 'Missing url or cftoken' }, 400, origin);
        }

        const targetUrl = `${VD6S_BASE}/mates/en/analyze/ajax?retry=1&platform=${encodeURIComponent(platform || 'youtube')}&mhash=${encodeURIComponent(mhash || '')}`;

        const upstream = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://vd6s.net/en5/',
            'Origin': 'https://vd6s.net',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
          },
          body: new URLSearchParams({
            url: videoUrl,
            ajax: '1',
            lang: lang || 'en',
            cftoken: cftoken
          }).toString()
        });

        const contentType = upstream.headers.get('Content-Type') || 'application/json';
        const text = await upstream.text();

        return new Response(text, {
          status: upstream.status,
          headers: {
            'Content-Type': contentType,
            ...corsHeaders(origin)
          }
        });
      } catch (err) {
        return jsonResponse({ error: 'Proxy error: ' + (err.message || 'unknown') }, 502, origin);
      }
    }

    // Convert: POST /convert
    if (url.pathname === '/convert' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { id, platform, cftoken } = body;

        if (!id) {
          return jsonResponse({ error: 'Missing id' }, 400, origin);
        }

        const targetUrl = `${VD6S_BASE}/mates/en/convert?id=${encodeURIComponent(id)}`;

        const upstream = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://vd6s.net/en5/',
            'Origin': 'https://vd6s.net',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          body: new URLSearchParams({
            platform: platform || 'youtube',
            cftoken: cftoken || ''
          }).toString()
        });

        const contentType = upstream.headers.get('Content-Type') || 'application/json';
        const text = await upstream.text();

        return new Response(text, {
          status: upstream.status,
          headers: {
            'Content-Type': contentType,
            ...corsHeaders(origin)
          }
        });
      } catch (err) {
        return jsonResponse({ error: 'Proxy error: ' + (err.message || 'unknown') }, 502, origin);
      }
    }

    // Status: GET /status?id=...
    if (url.pathname === '/status' && request.method === 'GET') {
      try {
        const id = url.searchParams.get('id');
        const platform = url.searchParams.get('platform') || 'youtube';

        if (!id) {
          return jsonResponse({ error: 'Missing id' }, 400, origin);
        }

        const targetUrl = `${VD6S_BASE}/mates/en/convert/status?id=${encodeURIComponent(id)}`;

        const upstream = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://vd6s.net/en5/',
            'Origin': 'https://vd6s.net',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          body: new URLSearchParams({
            platform: platform,
            cftoken: ''
          }).toString()
        });

        const contentType = upstream.headers.get('Content-Type') || 'application/json';
        const text = await upstream.text();

        return new Response(text, {
          status: upstream.status,
          headers: {
            'Content-Type': contentType,
            ...corsHeaders(origin)
          }
        });
      } catch (err) {
        return jsonResponse({ error: 'Proxy error: ' + (err.message || 'unknown') }, 502, origin);
      }
    }

    return jsonResponse({ error: 'Not found', path: url.pathname }, 404, origin);
  }
};
