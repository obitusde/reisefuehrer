/* Reiseführer – app (v0.4.0). UI only; data logic lives in core.js. */
(function () {
  'use strict';

  var VERSION = '0.4.0';
  var C = window.RF && window.RF.core;

  // ------------------------------------------------------------ storage
  var K = {
    settings: 'rf.settings', last: 'rf.last', merk: 'rf.merk', wd: 'rf.wdcache',
    ort: 'rf.ortcache2', view: 'rf.view', split: 'rf.split', recent: 'rf.recent', kurz: 'rf.kurz2', heard: 'rf.gehoert'
  };
  var LS = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  // Small IndexedDB key-value store (OSM tiles are too big for localStorage); falls back to memory
  var IDB = (function () {
    var mem = {}, dbp = null;
    function open() {
      if (!dbp) dbp = new Promise(function (res, rej) {
        if (!window.indexedDB) { rej(new Error('kein IndexedDB')); return; }
        var r = indexedDB.open('reisefuehrer', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
      return dbp;
    }
    function tx(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (res) {
          var t = db.transaction('kv', mode), st = t.objectStore('kv'), out = fn(st);
          t.oncomplete = function () { res(out && out.result); };
          t.onerror = t.onabort = function () { res(undefined); };
        });
      });
    }
    return {
      get: function (k) { return tx('readonly', function (s) { return s.get(k); }).catch(function () { return mem[k]; }); },
      set: function (k, v) { return tx('readwrite', function (s) { s.put(v, k); }).catch(function () { mem[k] = v; }); },
      clear: function () { mem = {}; return tx('readwrite', function (s) { s.clear(); }).catch(function () {}); }
    };
  })();

  // -------------------------------------------------------------- state
  var cfg = null;
  var settings = LS.get(K.settings, {}) || {};
  var last = LS.get(K.last, null);       // {version, lat, lon, radius, ort, time, places, warnings}
  // Results saved by an older version were scored differently: drop them (user searches again)
  if (last && last.version !== VERSION) { last = null; LS.del(K.last); }
  var merk = LS.get(K.merk, []) || [];   // saved place objects
  var heard = LS.get(K.heard, {}) || {};  // id -> time ("schon gehört")
  var wdStore = LS.get(K.wd, {}) || {};
  var wdCache = { get: function (k) { return wdStore[k]; }, set: function (k, v) { wdStore[k] = v; } };
  var userPos = null, busy = false, selectedId = null;
  var map, markerLayer, searchCircle, userMarker, userAcc;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function saveSettings() { LS.set(K.settings, settings); }

  // ----------------------------------------------------------- feedback
  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2600);
  }
  function setStatus(text, cls) {
    var s = $('status');
    s.textContent = text || '';
    s.className = 'status' + (cls ? ' ' + cls : '');
  }

  // ---------------------------------------------------------- clipboard
  function copyFallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { ta.setSelectionRange(0, text.length); } catch (e) { /* ignore */ }
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; },
        function () { return copyFallback(text); });
    }
    return Promise.resolve(copyFallback(text));
  }
  function selectElementText(el) {
    try {
      var r = document.createRange(); r.selectNodeContents(el);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    } catch (e) { /* ignore */ }
  }
  function shareText(title, text) {
    if (navigator.share) {
      return navigator.share({ title: title, text: text }).then(function () { return 'shared'; },
        function (e) { return e && e.name === 'AbortError' ? 'cancel' : copyText(text).then(function (ok) { return ok ? 'copied' : 'fail'; }); });
    }
    return copyText(text).then(function (ok) { return ok ? 'copied' : 'fail'; });
  }

  // -------------------------------------------------------------- start
  function fatal(msg) {
    setStatus(msg, 'err');
    $('list').innerHTML = '<li class="empty">' + esc(msg) + '</li>';
  }

  function init() {
    $('version').textContent = 'v' + VERSION;
    if (!C || !window.L) { fatal('App-Dateien unvollständig geladen. Bitte neu laden.'); return; }
    fetch('config.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (txt) {
        try { cfg = JSON.parse(txt); } catch (e) { throw new Error('config.json ist kein gültiges JSON (' + e.message + ')'); }
        start();
      })
      .catch(function (e) { fatal('Konfiguration konnte nicht geladen werden: ' + e.message); });
    registerSW();
    checkUpdate();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') checkUpdate();
    });
  }

  function start() {
    var radien = cfg.wikipedia.radien_m;
    if (radien.indexOf(settings.radius) < 0) settings.radius = cfg.wikipedia.radius_standard_m;
    if (typeof settings.minStars !== 'number') settings.minStars = 1;
    if (!settings.kartenApp) settings.kartenApp = cfg.karten_app_standard || 'google';
    if (settings.kat == null) settings.kat = '';
    if (['kurz', 'normal', 'ausfuehrlich'].indexOf(settings.level) < 0) settings.level = (cfg.erzaehlen && cfg.erzaehlen.standard_ausfuehrlichkeit) || 'kurz';
    if (settings.focus == null) settings.focus = '';
    if (!settings.uebergabe) settings.uebergabe = cfg.claude_uebergabe || 'claude-new';
    if (settings.hideHeard == null) settings.hideHeard = false;
    if (settings.osm == null) settings.osm = true;
    saveSettings();

    // filters
    $('fStars').value = String(settings.minStars);
    $('fRadius').innerHTML = radien.map(function (r) {
      return '<option value="' + r + '">' + (r < 1000 ? r + ' m' : (r / 1000) + ' km') + '</option>';
    }).join('');
    $('fRadius').value = String(settings.radius);
    $('fKat').innerHTML = '<option value="">Alle Typen</option>' + cfg.kategorien.map(function (k) {
      return '<option value="' + esc(k.id) + '">' + esc(k.label) + '</option>';
    }).join('');
    $('fKat').value = settings.kat;

    initMap();
    initSplitter();
    bindUI();
    renderMerkCount();

    if (last && last.places) {
      drawSearchCircle(last.lat, last.lon, last.radius);
      renderAll();
    } else {
      renderAll();
    }
  }

  // ---------------------------------------------------------------- map
  function initMap() {
    var view = LS.get(K.view, null);
    map = L.map('map', { zoomControl: false, worldCopyJump: true })
      .setView(view ? [view.lat, view.lon] : [50.5, 8.5], view ? view.z : 5);
    map.attributionControl.setPrefix(false);
    map.attributionControl.setPosition('bottomleft');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-Mitwirkende</a>'
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    map.on('zoomend', renderMarkers);
    map.on('moveend', function () {
      var c = map.getCenter();
      LS.set(K.view, { lat: c.lat, lon: c.lng, z: map.getZoom() });
    });
    map.on('click', function () { if (!$('sheet').hidden) closeSheet(); });
    window.addEventListener('resize', function () { map.invalidateSize(); });
  }

  function drawSearchCircle(lat, lon, r) {
    if (searchCircle) map.removeLayer(searchCircle);
    searchCircle = L.circle([lat, lon], {
      radius: r, color: '#0e6b7d', weight: 2, opacity: .7, dashArray: '6 6', fill: true, fillOpacity: .04, interactive: false
    }).addTo(map);
  }

  function drawUser() {
    if (!userPos) return;
    var ll = [userPos.lat, userPos.lon];
    if (!userMarker) {
      userMarker = L.marker(ll, {
        icon: L.divIcon({ className: 'mk-wrap', html: '<div class="me-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
        interactive: false, keyboard: false, zIndexOffset: 3000
      }).addTo(map);
      userAcc = L.circle(ll, { radius: userPos.acc || 0, color: '#1a73e8', weight: 1, fillOpacity: .08, interactive: false }).addTo(map);
    } else {
      userMarker.setLatLng(ll);
      userAcc.setLatLng(ll).setRadius(userPos.acc || 0);
    }
  }

  var DOT_R = { 3: 11, 2: 8, 1: 6, 0: 5 };
  var LBL_PX = { 3: 12, 2: 11, 1: 11, 0: 10 };
  var measureCtx = null;
  function textWidth(t, px) {
    try {
      if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
      measureCtx.font = '600 ' + px + 'px system-ui, Roboto, sans-serif';
      return measureCtx.measureText(t).width;
    } catch (e) { return t.length * px * 0.55; }
  }

  function markerIcon(p, sel, label, side) {
    var html = '<span class="mk mk' + p.sterne + (sel ? ' sel' : '') + '"></span>';
    if (label) html += '<span class="mk-lbl l' + p.sterne + (side === 'left' ? ' left' : '') + '">' + esc(label) + '</span>';
    return L.divIcon({ className: 'mk-wrap', html: html, iconSize: [36, 36], iconAnchor: [18, 18] });
  }

  // Every visible point gets a short label, unless it would overlap a more important one.
  function renderMarkers() {
    if (!map) return;
    markerLayer.clearLayers();
    var z = map.getZoom(), minZoomSmall = (cfg.marker && cfg.marker.stern1_ab_zoom) || 16;
    var maxChars = (cfg.marker && cfg.marker.beschriftung_max_zeichen) || 18;
    var shown = visiblePlaces().filter(function (p) {
      return p.geprueft && (p.sterne >= 2 || z >= minZoomSmall || p.id === selectedId); // never pin unverified places
    }).sort(function (a, b) {
      return ((b.id === selectedId) - (a.id === selectedId)) || (b.sterne - a.sterne) || (b.score - a.score);
    });
    var boxes = [];
    function free(bx) {
      return !boxes.some(function (o) { return bx.x1 < o.x2 && bx.x2 > o.x1 && bx.y1 < o.y2 && bx.y2 > o.y1; });
    }
    shown.forEach(function (p) {
      var sel = p.id === selectedId;
      var pt = map.latLngToContainerPoint([p.lat, p.lon]);
      var r = DOT_R[p.sterne] || 5, px = LBL_PX[p.sterne] || 11;
      var label = C.shortLabel(p.name, last && last.ort, maxChars);
      var w = textWidth(label, px) + 3;
      var right = { x1: pt.x + r + 2, y1: pt.y - px * 0.75, x2: pt.x + r + 2 + w, y2: pt.y + px * 0.75 };
      var left = { x1: pt.x - r - 2 - w, y1: right.y1, x2: pt.x - r - 2, y2: right.y2 };
      var side = free(right) ? 'right' : free(left) ? 'left' : '';  // right of the dot, else left, else none
      if (side) boxes.push(side === 'right' ? right : left);
      boxes.push({ x1: pt.x - r, y1: pt.y - r, x2: pt.x + r, y2: pt.y + r });
      var m = L.marker([p.lat, p.lon], {
        icon: markerIcon(p, sel, side ? label : '', side), keyboard: false, title: p.name,
        zIndexOffset: sel ? 2500 : p.sterne * 400
      });
      m.on('click', function (e) {
        if (e.originalEvent) L.DomEvent.stopPropagation(e);
        select(p.id, 'map');
      });
      markerLayer.addLayer(m);
    });
  }

  // ------------------------------------------------------------ splitter
  function initSplitter() {
    var wrap = $('mapWrap'), sp = $('splitter'), app = $('app');
    var saved = LS.get(K.split, null);
    if (typeof saved === 'number' && saved > 15 && saved < 85) wrap.style.flexBasis = saved + '%';
    var dragging = false, top0 = 0, h0 = 0;
    sp.addEventListener('pointerdown', function (e) {
      dragging = true; sp.classList.add('drag');
      top0 = wrap.getBoundingClientRect().top; h0 = app.getBoundingClientRect().height;
      try { sp.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      e.preventDefault();
    });
    sp.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var h = Math.max(120, Math.min(h0 - 200, e.clientY - top0));
      wrap.style.flexBasis = h + 'px';
      map.invalidateSize({ pan: false });
    });
    function end() {
      if (!dragging) return;
      dragging = false; sp.classList.remove('drag');
      var pct = wrap.getBoundingClientRect().height / app.getBoundingClientRect().height * 100;
      pct = Math.round(Math.max(18, Math.min(82, pct)));
      wrap.style.flexBasis = pct + '%';
      LS.set(K.split, pct);
      map.invalidateSize();
    }
    sp.addEventListener('pointerup', end);
    sp.addEventListener('pointercancel', end);
    sp.addEventListener('dblclick', function () {
      wrap.style.flexBasis = '55%'; LS.set(K.split, 55); map.invalidateSize();
    });
  }

  // ------------------------------------------------------------- search
  function withTimeout(p, ms, fallback) {
    return Promise.race([p, new Promise(function (res) { setTimeout(function () { res(fallback); }, ms); })]);
  }

  // {name, cc, region} of the search point (Nominatim, cached per ~1 km)
  function getPlaceInfo(lat, lon) {
    var key = lat.toFixed(2) + ',' + lon.toFixed(2);
    var oc = LS.get(K.ort, {}) || {};
    if (oc[key] && typeof oc[key] === 'object') return Promise.resolve(oc[key]);
    var p = C.reverseGeocode(lat, lon, function (u, o) { return fetch(u, o); }).then(function (info) {
      if (info && (info.name || info.cc)) {
        var keys = Object.keys(oc);
        if (keys.length > 200) delete oc[keys[0]];
        oc[key] = info; LS.set(K.ort, oc);
      }
      return info || {};
    }, function () { return {}; });
    return withTimeout(p, 6000, {});
  }

  function saveWd() {
    var keys = Object.keys(wdStore);
    if (keys.length > 4000) {
      keys.sort(function (a, b) { return (wdStore[a].t || 0) - (wdStore[b].t || 0); })
        .slice(0, keys.length - 4000).forEach(function (k) { delete wdStore[k]; });
    }
    if (!LS.set(K.wd, wdStore)) { wdStore = {}; LS.set(K.wd, {}); }
  }

  function setBusy(b) {
    busy = b;
    $('btnHere').disabled = b; $('btnLocate').disabled = b;
    $('btnHere').textContent = b ? 'Suche …' : 'Hier suchen';
  }

  function doSearch(lat, lon, fit, onDone) {
    if (busy) return;
    setBusy(true);
    var radius = settings.radius;
    drawSearchCircle(lat, lon, radius);
    if (fit) map.fitBounds(searchCircle.getBounds(), { padding: [12, 12] });
    setStatus('Bestimme Ort und Sprache …', 'busy');
    var ort = '';
    getPlaceInfo(lat, lon).then(function (info) {
      ort = info.name || '';
      return C.loadPlaces({
        lat: lat, lon: lon, radius: radius, cfg: cfg, wdCache: wdCache, osmCache: IDB, osm: settings.osm !== false,
        langs: C.languagesFor(info, cfg),
        localLang: C.localLanguage(info, cfg),
        fetch: function (u, o) { return fetch(u, o); },
        onProgress: function (t) { setStatus(t, 'busy'); }
      });
    }).then(function (res) {
      return Promise.resolve().then(function () {
        res.places.forEach(function (p) { p.ort = ort || ''; });
        last = { version: VERSION, lat: lat, lon: lon, radius: radius, ort: ort || '', time: Date.now(), places: res.places, warnings: res.warnings };
        if (!LS.set(K.last, last)) LS.del(K.last);
        saveWd();
        selectedId = null;
        if (!$('sheet').hidden) closeSheet();
        renderAll();
        if (res.warnings.length) toast('Hinweis: ' + res.warnings.join('; '), 5000);
        if (onDone) onDone();
      });
    }).catch(function (e) {
      setStatus('Fehler: ' + e.message + (navigator.onLine === false ? ' – keine Internetverbindung' : ''), 'err');
    }).then(function () { setBusy(false); });
  }

  function locate() {
    if (!navigator.geolocation) { toast('Standort wird von diesem Browser nicht unterstützt.'); return; }
    setStatus('Bestimme Standort …', 'busy');
    $('btnLocate').disabled = true;
    navigator.geolocation.getCurrentPosition(function (pos) {
      $('btnLocate').disabled = false;
      userPos = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy };
      drawUser();
      doSearch(userPos.lat, userPos.lon, true);
    }, function (err) {
      $('btnLocate').disabled = false;
      var msg = err.code === 1 ? 'Standortzugriff verweigert. Bitte in den Browser-Einstellungen für diese Seite erlauben.'
        : err.code === 3 ? 'Standort: Zeitüberschreitung. Bitte nochmal versuchen.'
        : 'Standort nicht verfügbar (GPS an?).';
      setStatus(msg, 'err');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }

  // ------------------------------------------------------------- render
  function visiblePlaces() {
    if (!last || !last.places) return [];
    return last.places.filter(function (p) {
      return p.sterne >= settings.minStars && (!settings.kat || p.kategorie === settings.kat) &&
        !(settings.hideHeard && heard[p.id]);
    });
  }

  function refPoint() {
    if (!last) return null;
    if (userPos && C.haversine(userPos.lat, userPos.lon, last.lat, last.lon) < 30000) return userPos;
    return { lat: last.lat, lon: last.lon };
  }
  function distOf(p) {
    var r = refPoint();
    return r ? C.haversine(r.lat, r.lon, p.lat, p.lon) : null;
  }

  function isMerk(id) { return merk.some(function (m) { return m.id === id; }); }

  function renderAll() {
    renderMarkers();
    renderList();
    var ol = $('ortLabel');
    ol.textContent = last && last.ort ? last.ort : '';
    ol.hidden = !(last && last.ort);
  }

  function renderList() {
    var ul = $('list');
    if (!last || !last.places) {
      ul.innerHTML = '<li class="empty">Tippe auf <b>◎ Mein Standort</b>, um Sehenswertes in deiner Nähe zu sehen.<br>' +
        'Oder schiebe die Karte an einen Ort (z. B. Manchester) und tippe auf <b>Hier suchen</b>.</li>';
      setStatus('');
      return;
    }
    var all = last.places, vis = visiblePlaces();
    var cnt = [0, 0, 0, 0];
    all.forEach(function (p) { cnt[p.sterne]++; });
    var txt = (last.ort ? last.ort + ': ' : '') + '★★★ ' + cnt[3] + ' · ★★ ' + cnt[2] + ' · ★ ' + cnt[1];
    if (settings.minStars > 0 && cnt[0]) txt += ' · ' + cnt[0] + ' ohne Stern';
    setStatus(txt);
    if (!vis.length) {
      ul.innerHTML = '<li class="empty">Keine Orte mit diesen Filtern. Stelle oben „Alle Orte“ oder eine andere Kategorie ein.</li>';
      return;
    }
    var dt = cfg.dauer_text || {};
    ul.innerHTML = vis.map(function (p) {
      var d = distOf(p);
      var meta = [heard[p.id] ? '✓ gehört' : '', p.typ_label, d != null ? C.formatDistance(d) : '', dt[String(p.sterne)] || ''].filter(Boolean).join(' · ');
      var on = isMerk(p.id);
      return '<li class="item' + (p.id === selectedId ? ' sel' : '') + (p.sterne ? '' : ' zero') + (heard[p.id] ? ' heard' : '') + '" data-id="' + esc(p.id) + '">' +
        '<div class="it-main">' +
          '<span class="it-stars s' + p.sterne + '">' + (p.sterne ? C.starsText(p.sterne) : '·') + '</span>' +
          '<span class="it-text"><span class="it-name">' + esc(p.name) + '</span>' +
          (p.name2 ? '<span class="it-name2">' + esc(p.name2) + '</span>' : '') +
          '<span class="it-meta">' + esc(meta) + '</span>' +
          '<span class="it-desc">' + esc(kurzText(p)) + '</span>' +
          '</span></div>' +
        '<button class="it-merk' + (on ? ' on' : '') + '" type="button" aria-label="Merken">' + (on ? '★' : '☆') + '</button>' +
        '</li>';
    }).join('');
    observeRows();
  }

  // ------------------------------------------------ short German info ("was ist das?")
  var kurzStore = LS.get(K.kurz, {}) || {};   // id -> {t: text, l: source language, via, d: time}
  var kurzQueue = {}, kurzTimer = null, kurzBusy = false, rowObserver = null;
  var KURZ_RETRY = 24 * 3600 * 1000;          // untranslated texts are retried after a day

  function kurzText(p) {
    var k = kurzStore[p.id];
    if (k && k.t) return k.t;
    if (p.osmOnly) return p.beschreibung || '';
    var d = C.stripLocation(p.beschreibung);
    return d && d.toLowerCase() !== String(p.typ_label || '').toLowerCase() ? d : '';
  }
  function kurzNeeded(id) {
    var k = kurzStore[id];
    return !k || (k.orig && Date.now() - (k.d || 0) > KURZ_RETRY);
  }
  function observeRows() {
    if (!('IntersectionObserver' in window)) return;
    if (!rowObserver) {
      rowObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var id = en.target.getAttribute('data-id');
          if (kurzNeeded(id)) kurzQueue[id] = 1;
          rowObserver.unobserve(en.target);
        });
        scheduleKurz();
      }, { root: $('list'), rootMargin: '150px 0px' });
    }
    Array.prototype.forEach.call(document.querySelectorAll('#list .item'), function (li) {
      if (kurzNeeded(li.getAttribute('data-id'))) rowObserver.observe(li);
    });
  }
  function scheduleKurz() { clearTimeout(kurzTimer); kurzTimer = setTimeout(runKurz, 200); }
  function saveKurz() {
    var keys = Object.keys(kurzStore);
    if (keys.length > 2500) keys.slice(0, keys.length - 2500).forEach(function (k) { delete kurzStore[k]; });
    LS.set(K.kurz, kurzStore);
  }
  function showKurz(id) {
    var p = findPlace(id);
    var el = document.querySelector('.item[data-id="' + cssEsc(id) + '"] .it-desc');
    if (p && el) el.textContent = kurzText(p);
    // the place window may already be open: show the text there too
    if (p && $('plDesc') && $('sheetBody').getAttribute('data-place') === id) {
      $('plDesc').textContent = kurzText(p);
      $('plDesc').hidden = !kurzText(p);
    }
  }
  function runKurz() {
    if (kurzBusy) { scheduleKurz(); return; }
    var ids = Object.keys(kurzQueue).slice(0, 20);
    if (!ids.length) return;
    ids.forEach(function (id) { delete kurzQueue[id]; });
    var places = ids.map(findPlace).filter(Boolean);
    var f = function (u, o) { return fetch(u, o); };
    var order = (cfg.uebersetzung && cfg.uebersetzung.reihenfolge) || ['chrome', 'mymemory'];
    kurzBusy = true;
    C.loadIntros(places, f).then(function (intros) {
      // translate one after the other (gentle on the free service)
      return Object.keys(intros).reduce(function (pr, id) {
        return pr.then(function () {
          var it = intros[id];
          if (it.lang === 'de') { kurzStore[id] = { t: it.text, l: 'de', d: Date.now() }; showKurz(id); return; }
          return C.translate(it.text, it.lang, 'de', f, order).then(function (tr) {
            kurzStore[id] = { t: C.splitSentences(tr.text).map(C.dropLocation).join(' '), l: it.lang, via: tr.via, d: Date.now() };
          }, function () {
            kurzStore[id] = { t: it.text, l: it.lang, orig: true, d: Date.now() };
          }).then(function () { showKurz(id); });
        });
      }, Promise.resolve());
    }).catch(function () { /* offline: keep descriptions */ }).then(function () {
      saveKurz();
      kurzBusy = false;
      if (Object.keys(kurzQueue).length) scheduleKurz();
    });
  }

  function findPlace(id) {
    var p = last && last.places && last.places.filter(function (x) { return x.id === id; })[0];
    return p || merk.filter(function (x) { return x.id === id; })[0] || null;
  }

  function select(id, from) {
    var p = findPlace(id);
    if (!p) return;
    selectedId = id;
    renderMarkers();
    Array.prototype.forEach.call(document.querySelectorAll('.item.sel'), function (el) { el.classList.remove('sel'); });
    var row = document.querySelector('.item[data-id="' + cssEsc(id) + '"]');
    if (row) {
      row.classList.add('sel');
      if (from === 'map') row.scrollIntoView({ block: 'nearest' });
    }
    if (from !== 'map') {
      var z = Math.max(map.getZoom(), p.sterne >= 2 ? 15 : 16);
      map.setView([p.lat, p.lon], z, { animate: true });
    }
    openPlace(p);
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }

  // -------------------------------------------------------------- sheet
  function openSheet(title, html) {
    $('sheetTitle').textContent = title;
    $('sheetBody').innerHTML = html;
    if ($('sheet').hidden) {
      $('sheet').hidden = false;
      try { history.pushState({ rfSheet: 1 }, ''); } catch (e) { /* ignore */ }
    }
    // always start at the top (picture and text), also when switching from one place to the next
    $('sheetBody').scrollTop = 0;
    requestAnimationFrame(function () { $('sheetBody').scrollTop = 0; });
  }
  function hideSheet() {
    $('sheet').hidden = true;
    if (selectedId) {
      selectedId = null;
      renderMarkers();
      Array.prototype.forEach.call(document.querySelectorAll('.item.sel'), function (el) { el.classList.remove('sel'); });
    }
  }
  function closeSheet() {
    if (history.state && history.state.rfSheet) history.back(); else hideSheet();
  }

  function mapsLinks(p) {
    if (settings.kartenApp === 'geo') {
      return { name: C.geoSearchUrl(p), pin: C.geoPinUrl(p), label: 'In Karten-App', target: '' };
    }
    return { name: C.gmapsSearchUrl(p), pin: C.gmapsPinUrl(p), label: 'In Google Maps', target: ' target="_blank" rel="noopener"' };
  }

  function openPlace(p) {
    var st = cfg.sterne_text || {}, dt = cfg.dauer_text || {};
    var d = distOf(p);
    var meta = [p.typ_label, d != null ? C.formatDistance(d) + ' entfernt' : '', dt[String(p.sterne)] ? 'Dauer ' + dt[String(p.sterne)] : '']
      .filter(Boolean).join(' · ');
    var ml = mapsLinks(p);
    var on = isMerk(p.id);
    var t = p.teile || {};
    var osmTag = p.osm && p.osm.k ? ' (OSM: ' + p.osm.k + ')' : '';
    var rows = p.osmOnly ? [
      ['Grundwert OpenStreetMap (höchstens ★, Museen ★★)', t.osm_basis],
      ['Denkmal', t.denkmal],
      ['Typ: ' + p.typ_label + osmTag, t.typ]
    ] : [
      ['Sprachversionen (' + p.sprachversionen + ')', t.sprachversionen],
      ['Artikellänge (' + (p.laenge || 0).toLocaleString('de-DE') + ' Bytes)', t.laenge],
      ['Denkmal/UNESCO', t.denkmal],
      ['Typ: ' + p.typ_label + (p.klassen && p.klassen.length ? ' (Wikidata: ' + p.klassen.join(', ') + ')' : osmTag), t.typ],
      ['Weitere Quellen (' + p.quellen.join(' + ') + ')', t.quellen]
    ];
    var srcNames = { W: 'Wikipedia', O: 'OpenStreetMap', V: 'Wikivoyage', C: 'Claude-Liste' };
    var lv = settings.level;
    var foci = (cfg.erzaehlen && cfg.erzaehlen.schwerpunkte) || [];
    var html =
      '<div id="plImg" class="pl-img" hidden></div>' +
      (p.name2 ? '<p class="pl-name2">Deutsch: ' + esc(p.name2) + '</p>' : '') +
      '<div class="pl-stars s' + p.sterne + '">' + (p.sterne ? C.starsText(p.sterne) : '–') +
        '<span>' + esc(st[String(p.sterne)] || '') + '</span></div>' +
      '<p class="pl-meta">' + esc(meta) + '</p>' +
      '<p class="pl-desc" id="plDesc"' + (kurzText(p) ? '' : ' hidden') + '>' + esc(kurzText(p)) + kurzNote(p) + '</p>' +
      '<div class="tell">' +
        '<div class="seg" role="group" aria-label="Ausführlichkeit">' +
          [['kurz', 'kurz'], ['normal', 'normal'], ['ausfuehrlich', 'ausführlich']].map(function (x) {
            return '<button type="button" data-a="level" data-level="' + x[0] + '"' + (lv === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>';
          }).join('') +
        '</div>' +
        '<select id="focusSel" class="focus" aria-label="Schwerpunkt"><option value="">Schwerpunkt: keiner</option>' +
          foci.map(function (f) { return '<option' + (settings.focus === f ? ' selected' : '') + '>' + esc(f) + '</option>'; }).join('') +
        '</select>' +
        '<button class="btn primary big" type="button" data-a="tell">🎧 Erzähl mir davon</button>' +
        '<button class="btn big review-btn" type="button" data-a="review">💬 Lohnt sich das?</button>' +
        '<div id="tellStatus" class="tell-status" hidden></div>' +
        '<button class="btn heard-btn' + (heard[p.id] ? ' on' : '') + '" type="button" data-a="heard">' + (heard[p.id] ? '✓ Schon gehört' : 'Als gehört markieren') + '</button>' +
      '</div>' +
      '<div class="actions">' +
        '<button class="btn" type="button" data-a="copy">Name kopieren</button>' +
        (p.wikipedia ? '<a class="btn" href="' + esc(C.wikipediaUrl(p)) + '" target="_blank" rel="noopener">Wikipedia</a>' : '') +
        '<a class="btn primary" href="' + esc(ml.name) + '"' + ml.target + '>' + ml.label + '</a>' +
        '<a class="btn" href="' + esc(ml.pin) + '"' + ml.target + '>Pin</a>' +
        '<button class="btn wide' + (on ? ' on' : '') + '" type="button" data-a="merk">' + (on ? '★ Gemerkt' : '☆ Merken') + '</button>' +
      '</div>' +
      '<details class="why"><summary>Warum ' + (p.sterne ? C.starsText(p.sterne) : 'kein Stern') + '?</summary><table>' +
        rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + (r[1] == null ? '–' : r[1].toFixed(1)) + '</td></tr>'; }).join('') +
        '<tr><td><b>Punkte</b></td><td><b>' + (p.score == null ? '–' : p.score.toFixed(1)) + '</b></td></tr>' +
      '</table><p class="small">Faustregel aus Wikipedia/Wikidata. Gewichte und Schwellen stehen in config.json.</p></details>' +
      '<details class="why" id="plIntro" hidden><summary>Wikipedia-Einleitung</summary><p class="intro" id="plIntroText"></p></details>' +
      '<p class="src">Quellen: ' + p.quellen.map(function (q) { return srcNames[q] || q; }).join(' · ') + '. Lizenzen: ' +
        [p.quellen.indexOf('W') >= 0 || p.wikipedia ? 'Wikipedia (CC BY-SA 4.0), Wikidata (CC0)' : '',
         p.quellen.indexOf('O') >= 0 ? '© OpenStreetMap-Mitwirkende (ODbL)' : '',
         p.ort ? 'Ortsname: Nominatim' : ''].filter(Boolean).join(', ') + '.</p>';
    openSheet(p.name, html);
    $('sheetBody').setAttribute('data-place', p.id);
    if (kurzNeeded(p.id)) { kurzQueue[p.id] = 1; scheduleKurz(); }
    prepareNarration(p);
  }

  // ---------------------------------------------------- narration (v0.3)
  var narr = null; // {pid, cache: {kurz: Promise, full: Promise}, prompt, url}
  var LANG_NOM = { de: 'Deutsch', en: 'Englisch', fr: 'Französisch', it: 'Italienisch', es: 'Spanisch', nl: 'Niederländisch', pt: 'Portugiesisch' };

  function articleFor(level) {
    var key = level === 'kurz' ? 'kurz' : 'full';
    if (!narr.cache[key]) {
      var p = findPlace(narr.pid);
      narr.cache[key] = C.loadArticle(p, key, function (u, o) { return fetch(u, o); });
      narr.cache[key].catch(function () { if (narr) delete narr.cache[key]; });
    }
    return narr.cache[key];
  }

  // Preload: intro + picture for the detail view, and the text for the chosen level,
  // so that "Erzähl mir davon" can open Claude right away (within the tap).
  function prepareNarration(p) {
    narr = { pid: p.id, cache: {} };
    var pid = p.id;
    articleFor('kurz').then(function (art) {
      if (!narr || narr.pid !== pid) return;
      if (art.thumb && $('plImg')) {
        $('plImg').innerHTML = '<img src="' + esc(art.thumb) + '" alt="" onerror="this.parentNode.hidden=true">';
        $('plImg').hidden = false;
      }
      if (art.intro && $('plIntro')) {
        $('plIntroText').textContent = art.intro;
        $('plIntro').querySelector('summary').textContent = 'Wikipedia-Einleitung (' + (LANG_NOM[art.lang] || art.lang) + ')';
        $('plIntro').hidden = false;
      }
      var k = kurzStore[pid];
      if (k && k.t && $('plDesc')) { $('plDesc').innerHTML = esc(k.t) + kurzNote(p); $('plDesc').hidden = false; }
    }, function () { /* no article: detail view without picture */ });
    if (settings.level !== 'kurz') articleFor(settings.level).catch(function () {});
  }

  function distanceForPrompt(p) {
    if (!userPos) return null;
    var d = C.haversine(userPos.lat, userPos.lon, p.lat, p.lon);
    return d < 30000 ? d : null;
  }

  function setTellStatus(html) {
    var st = $('tellStatus');
    if (!st) return;
    st.innerHTML = html; st.hidden = !html;
  }

  function tell() {
    var p = findPlace(narr && narr.pid);
    if (!p) return;
    var level = settings.level, t0 = Date.now();
    setTellStatus('Lade Text …');
    articleFor(level).catch(function () { return null; }).then(function (art) {
      var pr = C.buildPrompt(p, { article: art, level: level, schwerpunkt: settings.focus, distance: distanceForPrompt(p) }, cfg);
      markHeard(p.id, true);
      handOver(pr, (pr.truncated ? ', Quelltext gekürzt' : '') + (art ? '' : ', ohne Wikipedia-Text'), t0);
    });
  }

  // "Lohnt sich das?": Claude searches and sums up visitor reviews
  function review() {
    var p = findPlace(narr && narr.pid);
    if (!p) return;
    handOver(C.buildReviewPrompt(p, cfg), '', Date.now());
  }

  // Copies the prompt and opens Claude (method from the settings)
  function handOver(pr, extra, t0) {
    narr.prompt = pr.text;
    return copyText(pr.text).then(function (copied) {
      var method = settings.uebergabe;
      narr.url = method === 'kopieren' ? '' : method === 'kopieren-app' ? 'claude://claude.ai/new' : C.claudeNewUrl(pr.text);
      var info = (copied ? 'Prompt kopiert' : 'Kopieren nicht möglich') + ' (' + pr.length.toLocaleString('de-DE') + ' Zeichen' + (extra || '') + ').';
      var hint = method === 'claude-new' ? ' Claude öffnet sich mit dem Text.' : method === 'kopieren-app' ? ' In Claude lange ins Eingabefeld tippen → Einfügen.' : ' In Claude einfügen.';
      setTellStatus('<p>' + esc(info + hint) + '</p><div class="actions">' +
        '<button class="btn" type="button" data-a="recopy">Nochmal kopieren</button>' +
        (narr.url ? '<a class="btn primary" href="' + esc(narr.url) + '">Claude öffnen</a>' : '') + '</div>');
      // open Claude directly if the tap is still "fresh"; otherwise the user taps "Claude öffnen"
      if (narr.url && Date.now() - t0 < 4000) window.location.href = narr.url;
    });
  }

  function markHeard(id, on) {
    if (on) heard[id] = Date.now(); else delete heard[id];
    LS.set(K.heard, heard);
    var list = $('list'), top = list.scrollTop;
    renderList();            // row shows "✓ gehört" and is greyed
    list.scrollTop = top;
    var b = document.querySelector('[data-a="heard"]');
    if (b) { b.classList.toggle('on', !!on); b.textContent = on ? '✓ Schon gehört' : 'Als gehört markieren'; }
  }

  var LANG_NAMES = { en: 'Englischen', fr: 'Französischen', it: 'Italienischen', es: 'Spanischen', nl: 'Niederländischen',
    pt: 'Portugiesischen', pl: 'Polnischen', cs: 'Tschechischen', sv: 'Schwedischen', da: 'Dänischen', no: 'Norwegischen',
    fi: 'Finnischen', el: 'Griechischen', ja: 'Japanischen', zh: 'Chinesischen', ru: 'Russischen' };
  function kurzNote() { return ''; } // no translation note (user decision v0.3.1)

  function toggleMerk(id) {
    var p = findPlace(id);
    if (!p) return;
    if (isMerk(id)) merk = merk.filter(function (m) { return m.id !== id; });
    else merk.push(JSON.parse(JSON.stringify(p)));
    LS.set(K.merk, merk);
    renderMerkCount();
    var row = document.querySelector('.item[data-id="' + cssEsc(id) + '"] .it-merk');
    if (row) { var on = isMerk(id); row.classList.toggle('on', on); row.textContent = on ? '★' : '☆'; }
    return isMerk(id);
  }
  function renderMerkCount() {
    var b = $('merkCount');
    b.textContent = merk.length; b.hidden = !merk.length;
  }

  function openMerk() {
    var html;
    if (!merk.length) {
      html = '<p class="empty" style="padding:8px 0">Noch nichts gemerkt. Tippe bei einem Ort auf ☆.</p>';
    } else {
      html = '<ul class="merk-list">' + merk.map(function (p) {
        var ml = mapsLinks(p);
        return '<li data-id="' + esc(p.id) + '">' +
          '<div class="m-main" data-a="show"><span class="s' + p.sterne + '">' + (p.sterne ? C.starsText(p.sterne) : '·') + '</span> <b>' + esc(p.name) + '</b>' +
          '<span class="m-meta">' + esc([p.typ_label, p.ort].filter(Boolean).join(' · ')) + '</span></div>' +
          '<a class="round" href="' + esc(ml.name) + '"' + ml.target + ' aria-label="Karte">🗺</a>' +
          '<button class="round" type="button" data-a="remove" aria-label="Entfernen">✕</button></li>';
      }).join('') + '</ul>' +
      '<div class="actions">' +
        '<button class="btn primary" type="button" data-a="mcopy">Liste kopieren</button>' +
        '<button class="btn" type="button" data-a="mshare">Liste teilen</button>' +
        '<button class="btn danger wide" type="button" data-a="mclear">Alle entfernen</button>' +
      '</div>';
    }
    openSheet('Merkliste (' + merk.length + ')', html);
    $('sheetBody').removeAttribute('data-place');
  }

  function merkText() { return merk.map(C.merkZeile).join('\n'); }

  function openSettings() {
    var html =
      '<h3>Karten-App für „In Google Maps“ und „Pin“</h3>' +
      '<label class="opt"><input type="radio" name="kapp" value="google"' + (settings.kartenApp !== 'geo' ? ' checked' : '') + '> Google Maps (Web-Link, empfohlen)</label>' +
      '<label class="opt"><input type="radio" name="kapp" value="geo"' + (settings.kartenApp === 'geo' ? ' checked' : '') + '> Android-Karten-App (geo:-Link, Auswahl möglich)</label>' +
      '<h3>„Erzähl mir davon“: Übergabe an Claude</h3>' +
      [['claude-new', 'Claude-App mit fertigem Text öffnen (empfohlen)'], ['kopieren-app', 'Text kopieren und Claude-App öffnen'], ['kopieren', 'Nur kopieren']].map(function (o) {
        return '<label class="opt"><input type="radio" name="uebergabe" value="' + o[0] + '"' + (settings.uebergabe === o[0] ? ' checked' : '') + '> ' + o[1] + '</label>';
      }).join('') +
      '<h3>Schon gehört</h3>' +
      '<label class="opt"><input type="checkbox" id="hideHeard"' + (settings.hideHeard ? ' checked' : '') + '> Schon gehörte Orte in Liste und Karte ausblenden</label>' +
      '<div class="actions"><button class="btn wide" type="button" data-a="clearheard">Liste „Schon gehört“ leeren (' + Object.keys(heard).length + ')</button></div>' +
      '<h3>Quellen</h3>' +
      '<label class="opt"><input type="checkbox" id="useOsm"' + (settings.osm !== false ? ' checked' : '') + '> OpenStreetMap-Orte einbeziehen (Kunstwerke, Aussichtspunkte, Denkmäler …)</label>' +
      '<h3>Daten</h3>' +
      '<div class="actions"><button class="btn wide" type="button" data-a="clearcache">Zwischenspeicher leeren</button></div>' +
      '<p class="small">Löscht gespeicherte Orte, Wikidata- und OpenStreetMap-Daten und Kurztexte. Merkliste und Einstellungen bleiben.</p>' +
      '<h3>Hilfe</h3>' +
      '<div class="actions"><a class="btn" href="diag.html">Diagnose</a>' +
      '<a class="btn" href="https://github.com/obitusde/reisefuehrer/blob/main/CHANGELOG.md" target="_blank" rel="noopener">Änderungen</a></div>' +
      '<p class="small">Sterne sind eine Faustregel aus Wikipedia/Wikidata (Sprachversionen, Aufrufe, Artikellänge, Denkmalstatus, Art des Ortes), keine Expertenbewertung.</p>' +
      '<h3>Quellen und Lizenzen</h3>' +
      '<p class="small">Karte und Ortsnamen: © OpenStreetMap-Mitwirkende (ODbL). Orte und Texte: Wikipedia (CC BY-SA 4.0), Wikidata (CC0). ' +
      'Kartenbibliothek: Leaflet (BSD-2). Dein Standort bleibt auf dem Gerät; an die Schnittstellen gehen nur die Koordinaten der Suche.</p>' +
      '<p class="small">Version v' + VERSION + '</p>';
    openSheet('Einstellungen', html);
    $('sheetBody').removeAttribute('data-place');
  }

  // ------------------------------------------------------- place search
  var searchHits = [];
  function hitRow(h, i) {
    var sub = [h.typ, h.detail].filter(Boolean).join(' · ');
    return '<li><button type="button" data-a="hit" data-i="' + i + '"><b>' + esc(h.name) + '</b>' +
      (sub ? '<span>' + esc(sub) + '</span>' : '') + '</button></li>';
  }
  function hitsHtml(groups) {
    var i = 0;
    searchHits = [];
    return groups.filter(function (g) { return g.list.length; }).map(function (g) {
      return '<h3>' + esc(g.title) + '</h3><ul class="hits">' + g.list.map(function (h) {
        searchHits.push(h);
        return hitRow(h, i++);
      }).join('') + '</ul>';
    }).join('');
  }
  function normQ(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  // Sights already loaded whose name contains the query
  function localHits(q) {
    var nq = normQ(q);
    if (nq.length < 3 || !last || !last.places) return [];
    // the city name itself does not count ("Manchester" should find the city, not every "Manchester …")
    var ort = normQ(last.ort);
    var strip = function (t) { return ort ? (' ' + normQ(t) + ' ').split(' ' + ort + ' ').join(' ').trim() : normQ(t); };
    return last.places.filter(function (p) {
      return [p.name, p.name2, p.artikel && p.artikel.en, p.artikel && p.artikel.de].some(function (t) { return t && strip(t).indexOf(nq) >= 0; });
    }).slice(0, 5).map(function (p) {
      return { name: p.name, typ: (p.sterne ? C.starsText(p.sterne) + ' ' : '') + p.typ_label, detail: p.name2 || '', placeId: p.id };
    });
  }
  function openSearch() {
    var recent = LS.get(K.recent, []) || [];
    openSheet('Ort oder Sehenswürdigkeit suchen',
      '<form class="search-form" id="searchForm" autocomplete="off">' +
        '<input id="searchInput" type="search" enterkeyhint="search" placeholder="z. B. Lyon, Imperial War Museum" aria-label="Suchbegriff">' +
        '<button class="btn primary" type="submit">Suchen</button></form>' +
      '<div id="searchHits">' + hitsHtml([{ title: 'Zuletzt gesucht', list: recent }]) + '</div>' +
      '<p class="small">Treffer in der Nähe der Karte kommen zuerst. Die Karte springt hin und sucht dort Sehenswertes im eingestellten Umkreis. Ortssuche: Nominatim/© OpenStreetMap-Mitwirkende.</p>');
    $('sheetBody').removeAttribute('data-place');
    $('searchForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = $('searchInput').value.trim();
      if (!q) return;
      $('searchInput').blur();
      var loc = localHits(q);
      $('searchHits').innerHTML = hitsHtml([{ title: 'In der Liste', list: loc }]) + '<p class="small">Suche „' + esc(q) + '“ …</p>';
      var b = map.getBounds();
      var view = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
      C.searchPlaces(q, function (u, o) { return fetch(u, o); }, view).then(function (list) {
        $('searchHits').innerHTML = hitsHtml([{ title: 'In der Liste', list: loc }, { title: 'Treffer', list: list }]) +
          (list.length || loc.length ? '' : '<p class="small">Nichts gefunden. Anders schreiben, z. B. mit Ort: „Imperial War Museum North, Manchester“.</p>');
      }, function (err) {
        $('searchHits').innerHTML = hitsHtml([{ title: 'In der Liste', list: loc }]) + '<p class="small">Suche fehlgeschlagen: ' + esc(err.message) + '</p>';
      });
    });
    setTimeout(function () { try { $('searchInput').focus(); } catch (e) { /* ignore */ } }, 50);
  }
  function rememberHit(h) {
    var recent = (LS.get(K.recent, []) || []).filter(function (r) { return r.name !== h.name || r.detail !== h.detail; });
    recent.unshift({ name: h.name, detail: h.detail, typ: h.typ, poi: h.poi, lat: h.lat, lon: h.lon });
    LS.set(K.recent, recent.slice(0, 5));
  }
  function goToHit(h) {
    if (h.placeId) { select(h.placeId, 'list'); return; } // already loaded: just open it
    rememberHit(h);
    closeSheet();
    map.setView([h.lat, h.lon], 15, { animate: false });
    doSearch(h.lat, h.lon, true, h.poi ? function () {
      // a sight was searched: open the nearest loaded place (within 250 m)
      var best = null, bd = 250;
      (last && last.places || []).forEach(function (p) {
        var d = C.haversine(h.lat, h.lon, p.lat, p.lon);
        if (d < bd) { bd = d; best = p; }
      });
      if (best) select(best.id, 'list');
      else toast('„' + h.name + '“ hat keinen Wikipedia-Eintrag hier – Karte steht dort.', 4000);
    } : null);
  }

  // ---------------------------------------------------------- UI events
  function bindUI() {
    $('btnLocate').addEventListener('click', locate);
    $('btnHere').addEventListener('click', function () {
      var c = map.getCenter();
      doSearch(c.lat, c.lng, false);
    });
    $('btnMerk').addEventListener('click', openMerk);
    $('btnSearch').addEventListener('click', openSearch);
    $('btnSettings').addEventListener('click', openSettings);
    $('sheetClose').addEventListener('click', closeSheet);
    window.addEventListener('popstate', function () { if (!$('sheet').hidden) hideSheet(); });

    $('fStars').addEventListener('change', function () {
      settings.minStars = parseInt(this.value, 10) || 0; saveSettings(); renderAll();
    });
    $('fKat').addEventListener('change', function () {
      settings.kat = this.value; saveSettings(); renderAll();
    });
    $('fRadius').addEventListener('change', function () {
      settings.radius = parseInt(this.value, 10); saveSettings();
      if (last) doSearch(last.lat, last.lon, true);
    });

    $('list').addEventListener('click', function (e) {
      var li = e.target.closest('.item');
      if (!li) return;
      var id = li.getAttribute('data-id');
      if (e.target.closest('.it-merk')) {
        var on = toggleMerk(id);
        toast(on ? 'Gemerkt' : 'Aus Merkliste entfernt', 1400);
        return;
      }
      var sel = window.getSelection && String(window.getSelection());
      if (sel && sel.length > 0) return; // user is selecting text
      select(id, 'list');
    });

    $('sheetBody').addEventListener('click', function (e) {
      var el = e.target.closest('[data-a]');
      if (!el) return;
      var a = el.getAttribute('data-a');
      var pid = $('sheetBody').getAttribute('data-place');
      var p = pid ? findPlace(pid) : null;
      var li = e.target.closest('li[data-id]');
      if (a === 'copy' && p) {
        copyText(C.nameWithPlace(p)).then(function (ok) {
          if (ok) toast('Kopiert: ' + C.nameWithPlace(p));
          else { selectElementText($('sheetTitle')); toast('Kopieren nicht möglich – Name ist markiert.'); }
        });
      } else if (a === 'share' && p) {
        shareText(p.name, C.nameWithPlace(p) + '\n' + C.gmapsSearchUrl(p)).then(function (r) {
          if (r === 'copied') toast('Teilen nicht verfügbar – Text kopiert.');
        });
      } else if (a === 'merk' && p) {
        var on = toggleMerk(p.id);
        el.classList.toggle('on', on);
        el.textContent = on ? '★ Gemerkt' : '☆ Merken';
      } else if (a === 'show' && li) {
        select(li.getAttribute('data-id'), 'list'); // replaces sheet content, same history entry
      } else if (a === 'remove' && li) {
        merk = merk.filter(function (m) { return m.id !== li.getAttribute('data-id'); });
        LS.set(K.merk, merk); renderMerkCount(); renderList(); openMerk();
      } else if (a === 'mcopy') {
        copyText(merkText()).then(function (ok) { toast(ok ? 'Merkliste kopiert (' + merk.length + ' Orte)' : 'Kopieren nicht möglich'); });
      } else if (a === 'mshare') {
        shareText('Merkliste Reiseführer', merkText()).then(function (r) {
          if (r === 'copied') toast('Teilen nicht verfügbar – Liste kopiert.');
        });
      } else if (a === 'mclear') {
        if (confirm('Alle ' + merk.length + ' Orte aus der Merkliste entfernen?')) {
          merk = []; LS.set(K.merk, merk); renderMerkCount(); renderList(); openMerk();
        }
      } else if (a === 'tell') {
        tell();
      } else if (a === 'review') {
        review();
      } else if (a === 'level') {
        settings.level = el.getAttribute('data-level'); saveSettings();
        Array.prototype.forEach.call(document.querySelectorAll('[data-a="level"]'), function (b) { b.classList.toggle('on', b === el); });
        setTellStatus('');
        if (narr) articleFor(settings.level).catch(function () {});
      } else if (a === 'recopy') {
        if (narr && narr.prompt) copyText(narr.prompt).then(function (ok) { toast(ok ? 'Prompt nochmal kopiert' : 'Kopieren nicht möglich'); });
      } else if (a === 'heard' && p) {
        markHeard(p.id, !heard[p.id]);
        if (settings.hideHeard) renderAll();
      } else if (a === 'clearheard') {
        if (confirm('Liste „Schon gehört“ leeren?')) { heard = {}; LS.set(K.heard, heard); renderAll(); toast('„Schon gehört“ geleert'); }
      } else if (a === 'hit') {
        var h = searchHits[parseInt(el.getAttribute('data-i'), 10)];
        if (h) goToHit(h);
      } else if (a === 'clearcache') {
        if (confirm('Gespeicherte Orte und Wikidata-Daten löschen?')) {
          LS.del(K.last); LS.del(K.wd); LS.del(K.ort); LS.del(K.kurz); IDB.clear();
          wdStore = {}; last = null; kurzStore = {};
          if (searchCircle) { map.removeLayer(searchCircle); searchCircle = null; }
          renderAll(); toast('Zwischenspeicher geleert');
        }
      }
    });
    $('sheetBody').addEventListener('change', function (e) {
      if (e.target.id === 'focusSel') { settings.focus = e.target.value; saveSettings(); setTellStatus(''); return; }
      if (e.target.name === 'uebergabe') { settings.uebergabe = e.target.value; saveSettings(); toast('Übergabe gespeichert'); return; }
      if (e.target.id === 'useOsm') { settings.osm = e.target.checked; saveSettings(); toast('Gilt ab der nächsten Suche'); return; }
      if (e.target.id === 'hideHeard') { settings.hideHeard = e.target.checked; saveSettings(); renderAll(); return; }
      if (e.target.name === 'kapp') {
        settings.kartenApp = e.target.value; saveSettings();
        toast(e.target.value === 'geo' ? 'Karten-App: geo:-Link' : 'Karten-App: Google Maps');
      }
    });
  }

  // ------------------------------------------------------ update + PWA
  var lastCheck = 0;
  function checkUpdate() {
    if (Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    var test = /[?&]testupdate=1\b/.test(location.search);
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var remote = test ? '99.0.0' : j.version;
        if (C && C.compareVersions(remote, VERSION) > 0) showBanner(remote, test);
      })
      .catch(function () { /* offline: no banner */ });
  }

  function showBanner(remote, test) {
    $('bannerText').textContent = 'Neue Version v' + remote + ' verfügbar' + (test ? ' (Test)' : '');
    $('banner').hidden = false;
    if (map) setTimeout(function () { map.invalidateSize(); }, 50);
    $('bannerBtn').onclick = hardReload;
  }

  // Clears app caches (not user data in localStorage), unregisters the SW and reloads.
  function hardReload() {
    $('bannerBtn').disabled = true;
    $('bannerBtn').textContent = 'Lade …';
    var jobs = [];
    if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
    if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
      return Promise.all(rs.map(function (r) { return r.unregister(); }));
    }));
    Promise.all(jobs).catch(function () {}).then(function () { location.replace(location.pathname); });
  }

  function registerSW() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register('sw.js').catch(function () { /* app works without SW */ });
  }

  init();
})();
