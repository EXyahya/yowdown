/**
 * Ywdown — /api/download
 * ----------------------------------------------------
 * Cloudflare Pages Function. Acts as a proxy between the Ywdown
 * frontend and a cobalt.tools instance (the open-source YouTube
 * downloader backend).
 *
 * Backend selection (tries in order):
 *   1. YWDOWN_BACKEND  env var  → user's self-hosted cobalt instance (no auth)
 *   2. COBALT_API_KEY   env var → public api.cobalt.tools (requires free API key)
 *   3. Helpful error message guiding setup
 *
 * Frontend contract:
 *   POST { videoId, format, quality, kind }
 *   ← 200 { downloadUrl, filename }   ← file ready, navigate to URL
 *   ← 200 { picker, audio }          ← multiple streams (rare, treat as error)
 *   ← 4xx/5xx { error, message }
 *
 * See: https://github.com/imputnet/cobalt  for cobalt API spec.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// A few community cobalt instances that don't require an API key.
// Used only as a last-resort best-effort fallback.
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

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost({ request, env }) {
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

  // Build list of backends to try
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
    // Last-resort: try community instances
    COMMUNITY_FALLBACKS.forEach((url) => backends.push({ url, auth: null, name: 'community:' + url }));
  }

  let lastError = 'No backend returned a usable response.';

  for (const backend of backends) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Ywdown-Pages-Function/1.0 (+https://github.com/imputnet/cobalt)'
      };
      if (backend.auth) headers['Authorization'] = backend.auth;

      const upstream = await fetch(backend.url + '/api/json', {
        method: 'POST',
        headers,
        body: JSON.stringify(cobaltBody)
      });

      if (upstream.status === 429) {
        lastError = 'Backend rate-limited (' + backend.name + '). Try again later or set YWDOWN_BACKEND.';
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
        // Pick the first item from the picker (best-effort)
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

  // If we got here, all backends failed
  return jsonResponse({
    error: 'Download failed',
    message: lastError,
    hint: 'Set YWDOWN_BACKEND to a self-hosted cobalt instance, or COBALT_API_KEY for the public cobalt.tools API. See README.md for setup instructions.'
  }, 502);
}
