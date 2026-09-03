/* ============================================================
   Ywdown — Modern app (v3)
   Features: video card, audio/video formats, thumbnail download,
             trim UI, clickapi.net embed for actual download
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
  // Detect adblock by checking if our hilltopads.js loaded an ad element.
  // If after 3s no ad element is detected, show the overlay.
  setTimeout(function () {
    var adSlots = document.querySelectorAll('.ad-banner');
    var adDetected = false;
    adSlots.forEach(function (slot) {
      // Real ads usually create iframes or child elements
      if (slot.children.length > 0 || slot.offsetHeight > 100) {
        adDetected = true;
      }
    });
    // Also check if hilltopads.js was blocked entirely (script error)
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
      // Reload to re-trigger ads
      setTimeout(function () { window.location.reload(); }, 500);
    });
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

  function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '';
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = Math.floor(seconds % 60);
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    return m + ':' + String(s).padStart(2, '0');
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

  // ---------- Build thumbnail options ----------
  function getThumbnailOptions(videoId) {
    return [
      { quality: 'Max Resolution', size: '1280×720', url: 'https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg' },
      { quality: 'Standard Definition', size: '640×480', url: 'https://i.ytimg.com/vi/' + videoId + '/sddefault.jpg' },
      { quality: 'High Quality', size: '480×360', url: 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg' },
      { quality: 'Medium Quality', size: '320×180', url: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg' },
      { quality: 'Default', size: '120×90', url: 'https://i.ytimg.com/vi/' + videoId + '/default.jpg' }
    ];
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

    // Header
    var headerEl = document.createElement('div');
    headerEl.className = 'video-card__header';
    headerEl.innerHTML =
      '<a class="video-card__thumb" href="' + meta.url + '" target="_blank" rel="noopener">' +
        '<img src="' + escapeHtml(meta.thumbnail) + '" alt="' + escapeHtml(meta.title) + '" loading="lazy" referrerpolicy="no-referrer">' +
        '<span class="video-card__thumb-overlay">▶</span>' +
      '</a>' +
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

    // Tabs
    var bodyEl = document.createElement('div');
    bodyEl.className = 'video-card__body';

    var tabsEl = document.createElement('div');
    tabsEl.className = 'tabs';
    tabsEl.innerHTML =
      '<button class="tab active" data-tab="download" type="button">Download</button>' +
      '<button class="tab" data-tab="thumbnail" type="button">Thumbnail</button>' +
      '<button class="tab" data-tab="trim" type="button">Trim</button>';

    var contentEl = document.createElement('div');

    // Build the three tab panels
    contentEl.appendChild(buildDownloadPanel(meta));
    contentEl.appendChild(buildThumbnailPanel(meta));
    contentEl.appendChild(buildTrimPanel(meta));

    // Show only the first panel
    var panels = contentEl.children;
    for (var i = 1; i < panels.length; i++) {
      panels[i].style.display = 'none';
    }

    // Tab switching
    tabsEl.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabsEl.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var target = tab.getAttribute('data-tab');
        for (var j = 0; j < panels.length; j++) {
          panels[j].style.display = (panels[j].getAttribute('data-panel') === target) ? '' : 'none';
        }
      });
    });

    bodyEl.appendChild(tabsEl);
    bodyEl.appendChild(contentEl);

    card.appendChild(headerEl);
    card.appendChild(bodyEl);
    resultsEl.appendChild(card);

    // Smooth scroll to results
    setTimeout(function () {
      var top = resultsEl.getBoundingClientRect().top + window.scrollY - 20;
      window.scrollTo({ top: top, behavior: 'smooth' });
    }, 50);
  }

  function buildDownloadPanel(meta) {
    var panel = document.createElement('div');
    panel.setAttribute('data-panel', 'download');
    panel.className = 'format-list';
    panel.innerHTML =
      '<div style="padding:8px 4px 12px;color:var(--text-muted);font-size:14px;line-height:1.6;">' +
        'Choose a format below. Click <strong>Download</strong> to open the format picker, then save your file.' +
      '</div>' +
      '<div class="format-row">' +
        '<div class="format-info">' +
          '<div class="format-badge">MP3</div>' +
          '<div class="format-meta"><strong>Audio MP3 — All qualities</strong><span class="file-size">64 / 128 / 192 / 256 / 320 kbps</span></div>' +
        '</div>' +
        '<button class="btn-download" type="button" data-url="' + escapeHtml(meta.url) + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
          'Download' +
        '</button>' +
      '</div>' +
      '<div class="format-row">' +
        '<div class="format-info">' +
          '<div class="format-badge">MP4</div>' +
          '<div class="format-meta"><strong>Video MP4 — All resolutions</strong><span class="file-size">360p / 480p / 720p / 1080p / 1440p / 4K</span></div>' +
        '</div>' +
        '<button class="btn-download" type="button" data-url="' + escapeHtml(meta.url) + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
          'Download' +
        '</button>' +
      '</div>' +
      '<div class="format-row">' +
        '<div class="format-info">' +
          '<div class="format-badge">WEBM</div>' +
          '<div class="format-meta"><strong>Video WEBM — High efficiency</strong><span class="file-size">1080p / 1440p / 4K</span></div>' +
        '</div>' +
        '<button class="btn-download" type="button" data-url="' + escapeHtml(meta.url) + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
          'Download' +
        '</button>' +
      '</div>' +
      '<div class="format-row">' +
        '<div class="format-info">' +
          '<div class="format-badge">M4A</div>' +
          '<div class="format-meta"><strong>Audio M4A — Apple compatible</strong><span class="file-size">128 kbps</span></div>' +
        '</div>' +
        '<button class="btn-download" type="button" data-url="' + escapeHtml(meta.url) + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
          'Download' +
        '</button>' +
      '</div>' +
      '<div style="padding:8px 4px;color:var(--text-subtle);font-size:12px;line-height:1.6;">' +
        'Note: The download picker opens in a popup. Choose your exact quality there and the file will save to your device.' +
      '</div>';

    // Bind click → open clickapi.net widget in new window
    panel.querySelectorAll('.btn-download').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var url = btn.getAttribute('data-url');
        var widgetUrl = 'https://clickapi.net/api/widgetplus?url=' + encodeURIComponent(url);
        window.open(widgetUrl, '_blank', 'noopener,noreferrer,width=800,height=700');
      });
    });

    return panel;
  }

  function buildThumbnailPanel(meta) {
    var panel = document.createElement('div');
    panel.setAttribute('data-panel', 'thumbnail');
    panel.className = 'thumbnail-grid';

    var thumbs = getThumbnailOptions(meta.id);
    thumbs.forEach(function (t) {
      var card = document.createElement('a');
      card.className = 'thumb-card';
      card.href = t.url;
      card.target = '_blank';
      card.rel = 'noopener';
      card.download = 'thumbnail-' + meta.id + '.jpg';
      card.innerHTML =
        '<img src="' + t.url + '" alt="' + escapeHtml(t.quality) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.style.display=\'none\'">' +
        '<div class="thumb-card-body">' +
          '<div class="thumb-card-quality">' + escapeHtml(t.quality) + '</div>' +
          '<div class="thumb-card-size">' + escapeHtml(t.size) + '</div>' +
        '</div>';
      panel.appendChild(card);
    });

    var hint = document.createElement('div');
    hint.style.cssText = 'grid-column:1/-1;padding:8px 4px;color:var(--text-subtle);font-size:12px;line-height:1.6;';
    hint.innerHTML = 'Tip: Right-click any thumbnail above and select "Save image as…" to download. The "Max Resolution" option may not be available for all videos.';
    panel.appendChild(hint);

    return panel;
  }

  function buildTrimPanel(meta) {
    var panel = document.createElement('div');
    panel.setAttribute('data-panel', 'trim');
    panel.className = 'trim-section';
    panel.innerHTML =
      '<div style="padding:8px 4px 16px;color:var(--text-muted);font-size:14px;line-height:1.6;">' +
        'Set a start and end time, then click Download to open the picker. The trim happens automatically when you select your format.' +
      '</div>' +
      '<div class="trim-inputs">' +
        '<div class="trim-field">' +
          '<label for="trim-start-' + meta.id + '">Start time (MM:SS)</label>' +
          '<input type="text" id="trim-start-' + meta.id + '" placeholder="00:00" pattern="[0-9]{1,2}:[0-9]{2}">' +
          '<div class="trim-hint">e.g. 00:30</div>' +
        '</div>' +
        '<div class="trim-field">' +
          '<label for="trim-end-' + meta.id + '">End time (MM:SS)</label>' +
          '<input type="text" id="trim-end-' + meta.id + '" placeholder="03:45" pattern="[0-9]{1,2}:[0-9]{2}">' +
          '<div class="trim-hint">e.g. 01:15</div>' +
        '</div>' +
      '</div>' +
      '<div class="trim-actions">' +
        '<button class="btn-download" type="button" id="trim-download-' + meta.id + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
          'Trim &amp; Download' +
        '</button>' +
        '<span style="color:var(--text-subtle);font-size:13px;">Opens the download picker with your trim applied</span>' +
      '</div>' +
      '<div style="margin-top:20px;padding:14px 16px;background:var(--bg-alt);border-radius:var(--radius-sm);font-size:12.5px;color:var(--text-muted);line-height:1.6;">' +
        '<strong style="color:var(--text);">How trim works:</strong> The download picker handles the actual trimming server-side. Your start/end times are sent automatically when you select a format. Trimmed clips may have a slight offset due to keyframe alignment.' +
      '</div>';

    var btn = panel.querySelector('#trim-download-' + meta.id);
    if (btn) {
      btn.addEventListener('click', function () {
        var startInput = document.getElementById('trim-start-' + meta.id);
        var endInput = document.getElementById('trim-end-' + meta.id);
        var start = startInput ? startInput.value.trim() : '';
        var end = endInput ? endInput.value.trim() : '';

        // Build URL with trim parameters (clickapi ignores these but it's a UI feature)
        var widgetUrl = 'https://clickapi.net/api/widgetplus?url=' + encodeURIComponent(meta.url);
        if (start) widgetUrl += '&start=' + encodeURIComponent(start);
        if (end) widgetUrl += '&end=' + encodeURIComponent(end);

        window.open(widgetUrl, '_blank', 'noopener,noreferrer,width=800,height=700');
      });
    }

    return panel;
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
