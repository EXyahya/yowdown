# Ywdown — YouTube to MP3 & MP4 Converter

A fast, clean, browser-based YouTube downloader with a Y2Mate-inspired UI. **100% client-side** — no backend, no Worker, no API keys, no credit card.

## How it works

```
Browser                Piped API (public)         YouTube
  |                          |                       |
  |-- GET /streams/VIDEO_ID->|                       |
  |                          |-- fetch video info -->|
  |                          |<-- metadata + URLs ----|
  |<-- JSON { streams: [] } -|                       |
  |                          |                       |
  |-- fetch stream URL ----->| (via CORS proxy)       |
  |<-- file blob ------------|                       |
  |                          |                       |
  |-- save to disk --------->|                       |
```

The browser calls **public Piped API instances** to get video metadata + stream URLs, then downloads the file through a CORS proxy. No server needed.

## Trade-offs (please read)

✅ **Pros:**
- No backend, no Render, no Koyeb, no credit card
- No Discord, no API keys
- Deploys as a static site (Pages, Netlify, GitHub Pages — anywhere)
- Simple to maintain

⚠️ **Cons:**
- Depends on public Piped instances being up (5 fallbacks included)
- 1080p+ video usually comes as video-only (audio is separate) — these are skipped
- Very large files (4K, 1GB+) may fail to download via CORS proxy
- Public CORS proxies can rate-limit; downloads may fail during peak hours

If you need higher reliability, the original cobalt+Worker approach is better (see git history).

---

# Step-by-step deployment

## Option 1 — Cloudflare Pages (free, .pages.dev domain)

### 1. Upload files to GitHub
1. Create a GitHub repo named `ywdown` (or `yowdown`)
2. Upload all files from this zip to the repo root
3. Commit changes

### 2. Connect Cloudflare Pages
1. Go to https://dash.cloudflare.com → **Workers & Pages**
2. Click **Create** → **Pages** tab → **Connect to Git**
3. Authorize Cloudflare on GitHub → select your `ywdown` repo
4. Configure:
   - Project name: `ywdown` (or `yowdown`)
   - Production branch: `main`
   - Framework preset: None
   - Build command: (leave empty)
   - Build output directory: `/`
5. Click **Save and Deploy**
6. Wait ~1 minute — site live at `https://ywdown.pages.dev`

## Option 2 — Direct upload (no GitHub needed)

1. Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Upload assets**
2. Drag `ywdown.zip`
3. Project name: `ywdown`
4. Click **Deploy site**

## Option 3 — Any other static host

Upload the files to:
- Netlify Drop: https://app.netlify.com/drop
- Vercel: https://vercel.com (connect GitHub repo)
- GitHub Pages: push to `gh-pages` branch
- Surge: `surge . ywdown.surge.sh`

All work the same — this is a static site.

---

## Test it

1. Open your site URL
2. Paste a YouTube URL: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
3. Click **Convert**
4. Pick a format → click **Download**
5. File saves to your device

## Troubleshooting

### "Could not fetch video info"
- All Piped instances are down or rate-limited
- Wait 1-2 minutes and retry
- Try a different video — some are restricted

### "Download failed: All download methods failed"
- CORS proxies are rate-limited
- Wait a few minutes and try again
- Try a smaller format (MP3 instead of MP4, 128 kbps instead of 320)

### "HD video unavailable"
- YouTube serves 1080p+ as video-only (audio is on a separate stream)
- These require server-side muxing (ffmpeg) to combine audio + video
- Client-side downloads are limited to 360p / 720p MP4 (muxed streams)

### "Empty file" or 0-byte download
- The CORS proxy returned an error page instead of the file
- Try again — proxies are flaky

### Downloads work but file won't play
- Try a different format (M4A instead of OPUS for audio)
- Make sure your media player supports the format

---

## Project structure

```
ywdown/
├── index.html                  # Homepage
├── 404.html                    # Not-found page
├── _headers                    # Cloudflare Pages security + cache headers
├── _redirects                  # Cloudflare Pages redirect rules
├── manifest.webmanifest        # PWA manifest
├── robots.txt                  # SEO
├── sw.js                       # Service worker (offline cache)
├── assets/
│   ├── css/style.css           # All styles
│   ├── js/app.js               # Piped API + CORS proxy logic
│   └── images/
│       ├── logo.svg
│       ├── favicon.svg
│       └── icon-search.svg
└── pages/
    ├── faq.html
    ├── how-to.html
    └── about.html
```

## Tech stack

- **Frontend**: HTML5 + vanilla CSS + vanilla JS (no framework, no build)
- **API**: Public Piped instances (no key, no auth)
- **Download**: Direct fetch + CORS proxy fallback chain
- **Hosting**: Any static host (Cloudflare Pages, Netlify, Vercel, GitHub Pages)

## Legal & responsible use

- Only download content you own, have permission to download, or that is licensed for reuse
- Downloading does not transfer copyright to you
- Always respect YouTube's Terms of Service and the creator's license
- Don't redistribute downloaded files publicly without the creator's permission
