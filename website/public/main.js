// Download page behaviour: detects the visitor's OS, fills in the latest
// version and file sizes from /api/latest, and reveals sections on scroll.
// Every download link already works without this script (it points to /download/<platform>).
(function () {
  'use strict';
  document.documentElement.classList.remove('no-js');

  var MAC_ICON =
    '<svg class="os" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.3.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.8-1.1-2.8-4.3zM13.9 5.3c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1.1 3 1.1.1 2.3-.6 3-1.4z"/></svg>';

  /* ---------------------------------------------------------- OS detection */
  var ua = navigator.userAgent || '';
  var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  var isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  var os = /Mac/i.test(platform) || /Macintosh/i.test(ua) ? 'mac' : /Win/i.test(platform) || /Windows/i.test(ua) ? 'windows' : 'other';
  // Browsers report "Intel" even on Apple silicon; most Macs sold since 2020 are Apple silicon.
  var macArch = 'arm';

  function setPrimary() {
    var primary = document.querySelector('[data-primary]');
    var label = document.querySelector('[data-primary-label]');
    var secondary = document.querySelector('[data-secondary]');
    if (!primary || !label) return;
    if (isMobile || os === 'other') {
      primary.setAttribute('href', '#download');
      label.textContent = 'Download for Windows or Mac';
      if (secondary) secondary.style.display = 'none';
      return;
    }
    if (os === 'mac') {
      primary.setAttribute('href', macArch === 'intel' ? '/download/mac-intel' : '/download/mac');
      label.textContent = 'Download for Mac';
      var icon = primary.querySelector('svg');
      if (icon) icon.outerHTML = MAC_ICON;
    } else {
      primary.setAttribute('href', '/download/windows');
      label.textContent = 'Download for Windows';
    }
    var card = document.querySelector('.dl-card[data-platform="' + os + '"]');
    if (card) card.classList.add('detected');
  }

  setPrimary();

  // Chromium browsers can tell Apple silicon from Intel.
  if (os === 'mac' && navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    navigator.userAgentData
      .getHighEntropyValues(['architecture'])
      .then(function (v) {
        if (v.architecture === 'x86') {
          macArch = 'intel';
          setPrimary();
        }
      })
      .catch(function () {});
  }

  /* ---------------------------------------------------------- latest release */
  function formatSize(bytes) {
    if (!bytes) return '';
    return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return '';
    }
  }

  fetch('/api/latest', { headers: { Accept: 'application/json' } })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      if (!data || !data.version) {
        if (data && data.releasesUrl) setReleaseLinks(data.releasesUrl);
        return;
      }
      var line = document.querySelector('[data-version-line]');
      if (line) line.textContent = 'Version ' + data.version + (data.publishedAt ? ' · released ' + formatDate(data.publishedAt) : '') + '.';
      var heroMeta = document.querySelector('[data-hero-meta]');
      if (heroMeta) heroMeta.textContent = 'Version ' + data.version + ' · Windows 10/11 · macOS 11 or later · Free updates built in';

      Object.keys(data.assets || {}).forEach(function (key) {
        var asset = data.assets[key];
        var size = document.querySelector('[data-size="' + key + '"]');
        if (size) size.textContent = 'v' + data.version + ' · ' + formatSize(asset.size);
      });
      // Hide links to files this release does not include.
      document.querySelectorAll('[data-asset]').forEach(function (a) {
        if (!data.assets[a.getAttribute('data-asset')] && a.classList.contains('alt-link')) a.style.display = 'none';
      });
      setReleaseLinks(data.notesUrl);
    })
    .catch(function () {});

  function setReleaseLinks(url) {
    document.querySelectorAll('[data-notes-link],[data-releases-link]').forEach(function (a) {
      a.setAttribute('href', url);
    });
  }

  /* ---------------------------------------------------------- polish */
  var nav = document.querySelector('.nav');
  function onScroll() {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    items.forEach(function (el) {
      io.observe(el);
    });
  } else {
    items.forEach(function (el) {
      el.classList.add('in');
    });
  }
})();
