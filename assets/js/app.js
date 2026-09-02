/* ============================================================
   Ywdown — client-side application (inline embed edition)
   ------------------------------------------------------------
   Uses clickapi.net (the same backend Y2Mate uses) for downloads.
   The widget is embedded INLINE below the video card — no popup.
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
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

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

  // ---------- Fetch video metadata ----------
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
    card.className = 'video-card video-card--inline';

    // Header: thumbnail + title + author
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

    // Section divider
    var divider = document.createElement('div');
    divider.className = 'video-card__divider';
    divider.innerHTML =
      '<span class="divider-label">Choose your format</span>' +
      '<span class="divider-line"></span>';

    // Embedded widget container
    var widgetWrap = document.createElement('div');
    widgetWrap.className = 'widget-embed';

    var widgetUrl = 'https://clickapi.net/api/widgetplus?url=' + encodeURIComponent(meta.url);

    widgetWrap.innerHTML =
      '<div class="widget-embed__loading">' +
        '<div class="loader"></div>' +
        '<span>Loading download options…</span>' +
      '</div>' +
      '<iframe src="' + widgetUrl + '" ' +
        'title="Download options for ' + escapeHtml(meta.title) + '" ' +
        'referrerpolicy="no-referrer-when-downgrade" ' +
        'allow="fullscreen" ' +
        'sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads" ' +
        'loading="lazy"></iframe>';

    var iframe = widgetWrap.querySelector('iframe');
    var loadingEl = widgetWrap.querySelector('.widget-embed__loading');

    // Hide loading state once iframe loads
    iframe.addEventListener('load', function () {
      if (loadingEl) loadingEl.style.display = 'none';
      iframe.style.opacity = '1';
    });

    // Fallback: if iframe takes too long, show "open in new tab" link
    setTimeout(function () {
      if (loadingEl && loadingEl.style.display !== 'none') {
        var fallback = document.createElement('div');
        fallback.className = 'widget-fallback';
        fallback.innerHTML =
          '<p>Taking longer than usual. You can open the download page directly:</p>' +
          '<a href="' + widgetUrl + '" target="_blank" rel="noopener" class="btn-download btn-large">Open download page →</a>';
        widgetWrap.appendChild(fallback);
      }
    }, 12000);

    card.appendChild(header);
    card.appendChild(divider);
    card.appendChild(widgetWrap);
    resultsEl.appendChild(card);

    // Smooth scroll to results
    setTimeout(function () {
      var top = resultsEl.getBoundingClientRect().top + window.scrollY - 20;
      window.scrollTo({ top: top, behavior: 'smooth' });
    }, 50);
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

      showLoader('Fetching video info…');
      fetchVideoMeta(id)
        .then(function (meta) {
          renderVideoCard(meta);
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
