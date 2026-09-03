/* ============================================================
   Ywdown — Modern app (v4)
   Uses Cloudflare Turnstile + vd6s.net API via CORS proxy.
   Real format buttons (one per quality), real downloads.
   ============================================================ */
(function () {
  'use strict';

  // ---------- Config ----------
  // Update this with YOUR deployed Worker URL
  var PROXY_URL = 'https://vd6s-proxy.ywdown.workers.dev';
  var TURNSTILE_SITEKEY = '0x4AAAAAAAzuNQE5IJEnuaAp';

  // ---------- Theme toggle ----------
  var THEME_KEY = 'ywdown-theme';
  var root = document.documentElement;
  var saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light') root.setAttribute('data-theme', 'light');
  else if (saved === 'dark') root.setAttribute('data-theme', 'dark');
  // Default is dark (no attribute), so no else needed

  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var cur = root.getAttribute('data-theme');
      var next = cur === 'light' ? 'dark' : 'light';
      if (next === 'dark') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', 'light');
      localStorage.setItem(THEME_KEY, next);
    });
  }

  // ---------- Sticky header ----------
  var header = document.getElementById('siteHeader');
  function onScroll() {
    if (header) header.classList.toggle('scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- Mobile drawer ----------
  var menuBtn = document.getElementById('menuToggle');
  var drawer = document.getElementById('mobileDrawer');
  var backdrop = document.getElementById('drawerBackdrop');
  var drawerClose = document.getElementById('drawerClose');
  function openDrawer() {
    if (!drawer || !backdrop) return;
    drawer.classList.add('open');
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    if (!drawer || !backdrop) return;
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }
  if (menuBtn) menuBtn.addEventListener('click', openDrawer);
  if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

  // ---------- Anti-AdBlock detection ----------
  setTimeout(function () {
    var adSlots = document.querySelectorAll('.ad-banner');
    var adDetected = false;
    adSlots.forEach(function (slot) {
      if (slot.children.length > 0 || slot.offsetHeight > 100) {
        adDetected = true;
      }
    });
    if (!window.hilltopadsLoaded && !adDetected) {
      var overlay = document.getElementById('adblockOverlay');
      if (overlay) overlay.classList.add('active');
    }
  }, 3500);

  var adblockCloseBtn = document.getElementById('adblockClose');
  if (adblockCloseBtn) {
    adblockCloseBtn.addEventListener('click', function () {
      var overlay = document.getElementById('adblockOverlay');
      if (overlay) overlay.classList.remove('active');
      setTimeout(function () { window.location.reload(); }, 500);
    });
  }

  // ---------- Toast notification ----------
  function showToast(message, duration) {
    var existing = document.getElementById('ywdown-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'ywdown-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--bg-elev);color:var(--text);padding:14px 22px;border-radius:12px;font-size:14px;font-weight:600;box-shadow:var(--shadow-lg);z-index:9999;max-width:90vw;text-align:center;line-height:1.5;border:1px solid var(--border);';
    toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(function () { if (toast.parentNode) toast.remove(); }, 300);
    }, duration || 5000);
  }

  // ---------- YouTube URL parsing ----------
  function extractVideoId(input) {
    if (!input) return null;
    input = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
    var patterns = [
      /(?:youtube\.com\/watch\?(?:.*&)?v=)([a-zA-Z0-9_-]{11})/,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /(?:music\.youtube\.com\/watch\?(?:.*&)?v=)([a-zA-Z0-9_-]{11})/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = input.match(patterns[i]);
      if (m && m[1]) return m[1];
    }
    return null;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- MurmurHash64 (matches vd6s.net) ----------
  function murmurHash64(str) {
    var h1 = 0xdeadbeef;
    var h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) {
      var k = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ k, 0x85ebca6b);
      h2 = Math.imul(h2 ^ k, 0xc2b2ae35);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 0x85ebca6b) ^ Math.imul(h2 ^ (h2 >>> 13), 0xc2b2ae35);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 0x85ebca6b) ^ Math.imul(h1 ^ (h1 >>> 13), 0xc2b2ae35);
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  }

  // ---------- Fetch video metadata (for thumbnail) ----------
  function fetchVideoMeta(videoId) {
    var url = 'https://noembed.com/embed?url=https://www.youtube.com/watch?v=' + videoId;
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('Network error');
      return r.json();
    }).then(function (data) {
      if (data.error) throw new Error(data.error);
      return {
        id: videoId,
        title: data.title || 'Untitled video',
        author: data.author_name || 'Unknown',
        thumbnail: data.thumbnail_url || ('https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg'),
        provider: data.provider_name || 'YouTube',
        url: 'https://www.youtube.com/watch?v=' + videoId
      };
    });
  }

  // ---------- Call vd6s.net analyze API via proxy ----------
  function analyzeVideo(videoUrl, platform, cftoken) {
    var mhash = murmurHash64(videoUrl);
    return fetch(PROXY_URL + '/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: videoUrl,
        platform: platform || 'youtube',
        mhash: mhash,
        cftoken: cftoken,
        lang: 'en'
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('Proxy HTTP ' + r.status);
      return r.json();
    });
  }

  // ---------- Render Turnstile captcha ----------
  var turnstileToken = null;
  var captchaBox = null;
  var pendingVideoUrl = null;
  var pendingPlatform = 'youtube';

  function showCaptcha(videoUrl, platform) {
    pendingVideoUrl = videoUrl;
    pendingPlatform = platform;
    if (!captchaBox) {
      captchaBox = document.getElementById('captchaBox');
    }
    if (captchaBox) {
      captchaBox.classList.add('active');
      var container = document.getElementById('captchaContainer');
      if (container && window.turnstile) {
        container.innerHTML = '';
        window.turnstile.render('#captchaContainer', {
          sitekey: TURNSTILE_SITEKEY,
          callback: function (token) {
            turnstileToken = token;
            onCaptchaSolved();
          },
          errorCallback: function () {
            showToast('Captcha failed. Please try again.', 5000);
            captchaBox.classList.remove('active');
          }
        });
      }
    }
  }

  function onCaptchaSolved() {
    if (!pendingVideoUrl || !turnstileToken) return;
    showLoader('Analyzing video…');
    if (captchaBox) captchaBox.classList.remove('active');
    analyzeVideo(pendingVideoUrl, pendingPlatform, turnstileToken)
      .then(function (data) {
        if (data.status === 'success') {
          // Parse the HTML response to extract formats
          renderResultsFromVd6s(data, pendingVideoUrl);
        } else if (data.status === 'un supported') {
          showError('This URL is not supported. Try a public YouTube video.');
        } else {
          showError('Could not analyze video: ' + (data.status || 'unknown'));
        }
      })
      .catch(function (err) {
        showError('Network error: ' + (err.message || 'unknown') + '. Make sure you deployed the vd6s-proxy Worker.');
      });
  }

  // ---------- Render ----------
  var resultsEl = document.getElementById('results');
  var formEl = document.getElementById('searchForm');
  var inputEl = document.getElementById('url');

  function clearResults() {
    if (resultsEl) resultsEl.innerHTML = '';
  }

  function showLoader(label) {
    if (!resultsEl) return;
    resultsEl.innerHTML =
      '<div class="results-status">' +
        '<div class="loader"></div>' +
        '<span>' + (label || 'Loading…') + '</span>' +
      '</div>';
  }

  function showError(message) {
    if (!resultsEl) return;
    resultsEl.innerHTML =
      '<div class="empty-state">' +
        '<strong>Could not process this URL</strong>' +
        '<span>' + escapeHtml(message) + '</span>' +
      '</div>';
  }

  // Parse vd6s.net's HTML response and extract format buttons
  function renderResultsFromVd6s(data, videoUrl) {
    if (!resultsEl) return;
    clearResults();

    // Extract video ID from URL
    var id = extractVideoId(videoUrl);
    fetchVideoMeta(id).then(function (meta) {
      renderVideoCardWithFormats(meta, data);
    }).catch(function () {
      // Fallback: use just the URL
      renderVideoCardWithFormats({ id: id, url: videoUrl, title: 'YouTube Video', author: '', thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', provider: 'YouTube' }, data);
    });
  }

  function renderVideoCardWithFormats(meta, vd6sData) {
    if (!resultsEl) return;
    clearResults();

    // Parse the HTML from vd6s to find download links
    var parser = new DOMParser();
    var doc = parser.parseFromString(vd6sData.result || '', 'text/html');
    var downloadLinks = doc.querySelectorAll('a[href*="download"], a[href*="convert"], a.btn-download, a[download]');

    var card = document.createElement('div');
    card.className = 'video-card';

    // Header
    var headerEl = document.createElement('div');
    headerEl.className = 'video-card__header';
    headerEl.innerHTML =
      '<a class="video-card__thumb" href="' + escapeHtml(meta.url) + '" target="_blank" rel="noopener">' +
        '<img src="' + escapeHtml(meta.thumbnail) + '" alt="' + escapeHtml(meta.title) + '" loading="lazy" referrerpolicy="no-referrer">' +
        '<span class="video-card__thumb-overlay">▶</span>' +
      '</a>' +
      '<div class="video-card__info">' +
        '<h3 class="video-card__title">' + escapeHtml(meta.title) + '</h3>' +
        '<div class="video-card__meta">' +
          (meta.author ? '<span>' + escapeHtml(meta.author) + '</span><span class="dot"></span>' : '') +
          '<span>' + escapeHtml(meta.provider) + '</span>' +
          '<span class="dot"></span>' +
          '<span>ID: ' + escapeHtml(meta.id) + '</span>' +
        '</div>' +
      '</div>';

    // Body
    var bodyEl = document.createElement('div');
    bodyEl.className = 'video-card__body';

    // Tabs
    var tabsEl = document.createElement('div');
    tabsEl.className = 'tabs';
    tabsEl.innerHTML =
      '<button class="tab active" data-tab="download" type="button">Download</button>' +
      '<button class="tab" data-tab="thumbnail" type="button">Thumbnail</button>';

    var contentEl = document.createElement('div');

    // Download panel — one button per format from vd6s
    var downloadPanel = document.createElement('div');
    downloadPanel.setAttribute('data-panel', 'download');
    downloadPanel.className = 'format-list';

    if (downloadLinks.length > 0) {
      // Real format buttons from vd6s.net
      downloadLinks.forEach(function (link) {
        var href = link.getAttribute('href') || '';
        var text = (link.textContent || '').trim();
        var quality = link.getAttribute('data-quality') || '';
        var format = link.getAttribute('data-format') || '';

        if (!href || href === '#') return;

        // Build absolute URL if relative
        if (href.indexOf('http') !== 0) {
          href = 'https://vd6s.net' + (href.charAt(0) === '/' ? '' : '/') + href;
        }

        var row = document.createElement('div');
        row.className = 'format-row';

        var isAudio = text.toLowerCase().indexOf('mp3') >= 0 || text.toLowerCase().indexOf('m4a') >= 0 || text.toLowerCase().indexOf('audio') >= 0;
        var badgeClass = isAudio ? 'audio' : 'video';
        var badgeText = format || (isAudio ? 'MP3' : 'MP4');

        row.innerHTML =
          '<div class="format-info">' +
            '<div class="format-badge ' + badgeClass + '">' + escapeHtml(badgeText) + '</div>' +
            '<div class="format-meta"><strong>' + escapeHtml(text) + '</strong><span class="file-size">Click to download</span></div>' +
          '</div>' +
          '<a class="btn-download" href="' + escapeHtml(href) + '" target="_blank" rel="noopener">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
            'Download' +
          '</a>';

        downloadPanel.appendChild(row);
      });
    } else {
      // Fallback: open vd6s.net with URL pre-copied
      downloadPanel.innerHTML =
        '<div style="padding:8px 4px 12px;color:var(--text-muted);font-size:14px;line-height:1.6;">' +
          'Click the button below to open the download page. The YouTube URL is already copied to your clipboard.' +
        '</div>' +
        '<div class="format-row">' +
          '<div class="format-info">' +
            '<div class="format-badge video">ALL</div>' +
            '<div class="format-meta"><strong>All formats</strong><span class="file-size">MP3, MP4, WEBM, 4K, trim</span></div>' +
          '</div>' +
          '<button class="btn-download" type="button" id="open-vd6s-btn">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
            'Open' +
          '</button>' +
        '</div>';
    }

    // Thumbnail panel
    var thumbnailPanel = buildThumbnailPanel(meta);

    contentEl.appendChild(downloadPanel);
    contentEl.appendChild(thumbnailPanel);
    thumbnailPanel.style.display = 'none';

    // Tab switching
    tabsEl.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabsEl.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var target = tab.getAttribute('data-tab');
        downloadPanel.style.display = (target === 'download') ? '' : 'none';
        thumbnailPanel.style.display = (target === 'thumbnail') ? '' : 'none';
      });
    });

    bodyEl.appendChild(tabsEl);
    bodyEl.appendChild(contentEl);

    card.appendChild(headerEl);
    card.appendChild(bodyEl);
    resultsEl.appendChild(card);

    // Bind open-vd6s button if exists
    var openBtn = document.getElementById('open-vd6s-btn');
    if (openBtn) {
      openBtn.addEventListener('click', function () {
        copyToClipboard(meta.url).then(function () {
          window.open('https://vd6s.net/en5/', '_blank', 'noopener,noreferrer');
          showToast('✓ URL copied! Paste it on vd6s.net (Ctrl+V)', 6000);
        }).catch(function () {
          window.open('https://vd6s.net/en5/', '_blank', 'noopener,noreferrer');
        });
      });
    }

    // Smooth scroll to results
    setTimeout(function () {
      var top = resultsEl.getBoundingClientRect().top + window.scrollY - 20;
      window.scrollTo({ top: top, behavior: 'smooth' });
    }, 50);
  }

  function buildThumbnailPanel(meta) {
    var panel = document.createElement('div');
    panel.setAttribute('data-panel', 'thumbnail');
    panel.className = 'thumbnail-grid';

    var thumbs = [
      { quality: 'Max Resolution', size: '1280×720', url: 'https://i.ytimg.com/vi/' + meta.id + '/maxresdefault.jpg' },
      { quality: 'Standard Definition', size: '640×480', url: 'https://i.ytimg.com/vi/' + meta.id + '/sddefault.jpg' },
      { quality: 'High Quality', size: '480×360', url: 'https://i.ytimg.com/vi/' + meta.id + '/hqdefault.jpg' },
      { quality: 'Medium Quality', size: '320×180', url: 'https://i.ytimg.com/vi/' + meta.id + '/mqdefault.jpg' },
      { quality: 'Default', size: '120×90', url: 'https://i.ytimg.com/vi/' + meta.id + '/default.jpg' }
    ];

    thumbs.forEach(function (t) {
      var card = document.createElement('a');
      card.className = 'thumb-card';
      card.href = t.url;
      card.target = '_blank';
      card.rel = 'noopener';
      card.innerHTML =
        '<img src="' + t.url + '" alt="' + escapeHtml(t.quality) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.style.display=\'none\'">' +
        '<div class="thumb-card-body">' +
          '<div class="thumb-card-quality">' + escapeHtml(t.quality) + '</div>' +
          '<div class="thumb-card-size">' + escapeHtml(t.size) + '</div>' +
        '</div>';
      panel.appendChild(card);
    });

    return panel;
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    } else {
      return new Promise(function (resolve, reject) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); resolve(); } catch (e) { reject(e); }
        document.body.removeChild(ta);
      });
    }
  }

  // ---------- Form submit ----------
  if (formEl) {
    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      var val = inputEl ? inputEl.value : '';
      var id = extractVideoId(val);
      if (!id) {
        showError('Please paste a valid YouTube URL (e.g. https://youtube.com/watch?v=...) or video ID.');
        return;
      }

      var videoUrl = 'https://www.youtube.com/watch?v=' + id;
      var platform = 'youtube';

      // Show captcha box
      showCaptcha(videoUrl, platform);
    });
  }

  // ---------- Smooth scroll for in-page anchors ----------
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href').slice(1);
      if (!id) return;
      var target = document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }
})();
