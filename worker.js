/**
 * Ywdown API — Cloudflare Worker (standalone)
 * ----------------------------------------------------
 * Paste this entire file into:
 *   Cloudflare → Workers & Pages → Workers → Create Worker → Quick Edit
 *
 * Then set environment variables on the Worker:
 *   YWDOWN_BACKEND  = https://your-cobalt-instance.onrender.com
 *   (or)
 *   COBALT_API_KEY = your-cobalt.tools-api-key
 *
 * The Worker will be at: https://ywdown-api.<your-subdomain>.workers.dev
 * Test it: open that URL in your browser → should see {"ok":true,...}
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// Public community cobalt instances (no auth, used as last resort)
const COMMUNITY_FALLBACKS = [
  'https://cobalt-api.kwaa.dev',
  'https://co.eepy.today',
  'https://cobalt.synzr.ru'
];

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
  });
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Health check — visit the Worker URL in browser to verify it's live
    if (url.pathname === '/' || url.pathname === '/ping') {
      const hasBackend = !!(env.YWDOWN_BACKEND || env.COBALT_API_KEY);
      return jsonResponse({
        ok: true,
        service: 'ywdown-api',
        backendConfigured: hasBackend,
        backendType: env.YWDOWN_BACKEND ? 'self-hosted' : (env.COBALT_API_KEY ? 'cobalt.tools' : 'community-fallback')
      });
    }

    if (url.pathname !== '/api/download') {
      return jsonResponse({ error: 'Not found', path: url.pathname }, 404);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const { videoId, format, quality, kind } = body;
    if (!videoId || !format) {
      return jsonResponse({ error: 'Missing videoId or format' }, 400);
    }
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return jsonResponse({ error: 'Invalid videoId' }, 400);
    }

    const youtubeUrl = 'https://www.youtube.com/watch?v=' + videoId;

    // Build cobalt request body
    const cobaltBody = {
      url: youtubeUrl,
      filenamePattern: 'basic',
      disableMetadata: true
    };

    if (kind === 'audio') {
      cobaltBody.isAudioOnly = true;
      cobaltBody.aFormat = format; // mp3, m4a, wav, opus, ogg
      const bitrateMatch = String(quality || '').match(/\d+/);
      cobaltBody.audioBitrate = bitrateMatch ? bitrateMatch[0] : '128';
    } else {
      cobaltBody.isAudioOnly = false;
      cobaltBody.vCodec = format === 'webm' ? 'vp9' : 'h264';
      cobaltBody.vQuality = String(quality || '').replace(/\D/g, '') || '720';
    }

    // Build list of backends to try (in order)
    const backends = [];

    if (env.YWDOWN_BACKEND) {
      backends.push({ url: env.YWDOWN_BACKEND.replace(/\/$/, ''), auth: null, name: 'self-hosted' });
    }
    if (env.COBALT_API_KEY) {
      backends.push({
        url: 'https://api.cobalt.tools',
        auth: 'Api-Key ' + env.COBALT_API_KEY,
        name: 'cobalt.tools (api-key)'
      });
    }
    if (backends.length === 0) {
      // Last-resort: community instances (no auth needed)
      COMMUNITY_FALLBACKS.forEach((u) => backends.push({ url: u, auth: null, name: 'community:' + u }));
    }

    let lastError = 'No backend returned a usable response.';

    for (const backend of backends) {
      try {
        const headers = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'Ywdown-Worker/1.0'
        };
        if (backend.auth) headers['Authorization'] = backend.auth;

        const upstream = await fetch(backend.url + '/api/json', {
          method: 'POST',
          headers,
          body: JSON.stringify(cobaltBody)
        });

        if (upstream.status === 429) {
          lastError = 'Backend rate-limited (' + backend.name + '). Try again later.';
          continue;
        }
        if (!upstream.ok) {
          let txt = '';
          try { txt = await upstream.text(); } catch {}
          lastError = 'Backend ' + backend.name + ' returned ' + upstream.status + ': ' + txt.slice(0, 200);
          continue;
        }

        const data = await upstream.json();

        if (data.status === 'tunnel' || data.status === 'redirect' || data.status === 'stream') {
          return jsonResponse({
            downloadUrl: data.url,
            filename: data.filename || ('ywdown_' + videoId + '.' + format),
            backend: backend.name
          });
        }

        if (data.status === 'picker' && data.picker) {
          const first = data.picker[0];
          if (first && first.url) {
            return jsonResponse({
              downloadUrl: first.url,
              filename: data.filename || ('ywdown_' + videoId + '.' + format),
              backend: backend.name + ' (picker)'
            });
          }
        }

        if (data.status === 'error') {
          const msg = (data.error && (data.error.text || data.error.code)) || 'cobalt error';
          lastError = 'Backend ' + backend.name + ': ' + msg;
          continue;
        }

        lastError = 'Backend ' + backend.name + ' returned unexpected status: ' + data.status;
      } catch (err) {
        lastError = 'Network error with ' + backend.name + ': ' + (err.message || 'unknown');
      }
    }

    return jsonResponse({
      error: 'Download failed',
      message: lastError,
      hint: 'Set YWDOWN_BACKEND (self-hosted cobalt URL) or COBALT_API_KEY on this Worker.'
    }, 502);
  }
};
