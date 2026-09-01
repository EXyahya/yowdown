/* ============================================================
   Ywdown — client-side application
   ------------------------------------------------------------
   Uses clickapi.net (the same backend Y2Mate uses) for downloads.
   We embed their widget in a modal iframe — no backend, no Worker,
   no API key, no credit card needed.
   ============================================================ */
(function () {
  'use strict';

  // ---------- Theme toggle ----------
  var THEME_KEY = 'ywdown-theme';
  var root = document.documentElement;
  var saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark') root.setAttribute('data-theme', 'dark');
  else if (saved === 'light') root.setAttribute('data-theme', 'light');
  else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    root.setAttribute('data-theme', 'dark');
  }

  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var cur = root.getAttribute('data-theme');
      var next = cur === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem(THEME_KEY, next);
    });
  }

  // ---------- Mobile drawer ----------
  var menuBtn = document.getElementById('menuToggle');
  var drawer = document.getElementById('mobileDrawer');
  var backdrop = document.getElementById('drawerBackdrop');
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
  if (backdrop) backdrop.addEventListener('click', closeDrawer);
  var closeBtn = document.getElementById('drawerClose');
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDrawer(); closeDownloadModal(); } });

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
      switch (c) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return c;
      }
    });
  }

  // ---------- Fetch video metadata (via noembed.com, CORS-enabled) ----------
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
        '<span>' + (label || 'Fetching video info…') + '</span>' +
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

  function renderVideoCard(meta) {
    if (!resultsEl) return;
    clearResults();

    var card = document.createElement('div');
    card.className = 'video-card';

    var header = document.createElement('div');
    header.className = 'video-card__header';
    header.innerHTML =
      '<div class="video-card__thumb">' +
        '<img src="' + escapeHtml(meta.thumbnail) + '" alt="' + escapeHtml(meta.title) + '" loading="lazy" referrerpolicy="no-referrer">' +
      '</div>' +
      '<div class="video-card__info">' +
        '<h3 class="video-card__title">' + escapeHtml(meta.title) + '</h3>' +
        '<div class="video-card__meta">' +
          '<span>' + escapeHtml(meta.author) + '</span>' +
          '<span class="dot"></span>' +
          '<span>' + escapeHtml(meta.provider) + '</span>' +
          '<span class="dot"></span>' +
          '<span>ID: ' + meta.id + '</span>' +
        '</div>' +
      '</div>';

    var body = document.createElement('div');
    body.className = 'video-card__body';

    // Info banner explaining the download flow
    var info = document.createElement('div');
    info.className = 'download-info';
    info.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' +
      '<div>' +
        '<strong>Click Download to open the format picker</strong>' +
        '<span>You\'ll see all available MP3 and MP4 quality options in a popup window.</span>' +
      '</div>';

    var actions = document.createElement('div');
    actions.className = 'video-card__actions';

    var btn = document.createElement('button');
    btn.className = 'btn-download btn-large';
    btn.type = 'button';
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
      'Download Video';
    btn.addEventListener('click', function () {
      openDownloadModal(meta);
    });

    actions.appendChild(btn);
    body.appendChild(info);
    body.appendChild(actions);
    card.appendChild(header);
    card.appendChild(body);
    resultsEl.appendChild(card);
  }

  // ---------- Download modal (embeds clickapi.net widget) ----------
  var modalEl = document.getElementById('downloadModal');
  var modalFrame = document.getElementById('downloadFrame');
  var modalTitle = document.getElementById('modalTitle');
  var modalClose = document.getElementById('modalClose');
  var modalBackdrop = document.getElementById('modalBackdrop');

  function openDownloadModal(meta) {
    if (!modalEl || !modalFrame) {
      // Fallback: open in new tab
      window.open('https://clickapi.net/api/widgetplus?url=' + encodeURIComponent(meta.url), '_blank', 'noopener');
      return;
    }

    var widgetUrl = 'https://clickapi.net/api/widgetplus?url=' + encodeURIComponent(meta.url);
    modalFrame.src = widgetUrl;
    if (modalTitle) modalTitle.textContent = meta.title.length > 60 ? meta.title.slice(0, 60) + '…' : meta.title;

    modalEl.classList.add('open');
    modalBackdrop.classList.add('open');
    modalEl.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Show loading state until iframe loads
    modalFrame.style.opacity = '0';
    modalFrame.addEventListener('load', function onLoad() {
      modalFrame.style.opacity = '1';
      modalFrame.removeEventListener('load', onLoad);
    });

    // Timeout fallback — if iframe doesn't load in 8s, show a "open in new tab" link
    setTimeout(function () {
      if (modalFrame.style.opacity === '0') {
        var fallback = document.getElementById('modalFallback');
        if (fallback) fallback.style.display = 'block';
      }
    }, 8000);
  }

  function closeDownloadModal() {
    if (!modalEl || !modalBackdrop) return;
    modalEl.classList.remove('open');
    modalBackdrop.classList.remove('open');
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (modalFrame) {
      // Clear the iframe to stop any background processes
      setTimeout(function () { modalFrame.src = 'about:blank'; }, 100);
    }
    var fallback = document.getElementById('modalFallback');
    if (fallback) fallback.style.display = 'none';
  }

  if (modalClose) modalClose.addEventListener('click', closeDownloadModal);
  if (modalBackdrop) modalBackdrop.addEventListener('click', closeDownloadModal);

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

      showLoader('Fetching video info…');
      fetchVideoMeta(id)
        .then(function (meta) {
          renderVideoCard(meta);
          var top = resultsEl.getBoundingClientRect().top + window.scrollY - 20;
          window.scrollTo({ top: top, behavior: 'smooth' });
        })
        .catch(function (err) {
          showError('Could not fetch video info. The video may be private, age-restricted, or removed. (' + (err.message || 'error') + ')');
        });
    });
  }

  // ---------- Trending list clicks ----------
  document.querySelectorAll('.list a[data-video-id]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var vid = a.getAttribute('data-video-id');
      if (inputEl && vid) {
        inputEl.value = 'https://www.youtube.com/watch?v=' + vid;
        if (formEl) formEl.dispatchEvent(new Event('submit'));
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
