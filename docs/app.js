/* Reiseführer – app (v0.11.1). UI only; data logic lives in core.js. */
(function () {
  'use strict';

  var VERSION = '0.11.1';
  var C = window.RF && window.RF.core;

  // ------------------------------------------------------------ storage
  var K = {
    settings: 'rf.settings', last: 'rf.last', merk: 'rf.merk', wd: 'rf.wdcache',
    ort: 'rf.ortcache2', view: 'rf.view', split: 'rf.split', recent: 'rf.recent', kurz: 'rf.kurz3', heard: 'rf.gehoert'
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
      del: function (k) { delete mem[k]; return tx('readwrite', function (s) { s.delete(k); }).catch(function () {}); },
      // deletes all keys that start with the prefix (e.g. "osm:" = OpenStreetMap tiles)
      delPrefix: function (pre) {
        Object.keys(mem).forEach(function (k) { if (k.indexOf(pre) === 0) delete mem[k]; });
        return tx('readwrite', function (s) {
          s.delete(IDBKeyRange.bound(pre, pre + '￿'));
        }).catch(function () {});
      }
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
  var map, markerLayer, searchCircle, userMarker, userAcc, areaLayer;
  // v0.7.1: a search hit only moves the map; the search runs when "Hier suchen" is tapped
  var pendingHit = null, hitMarker = null;
  var busyQuiet = false;
  var run = null;      // running search {t0, text, phase, control, cancelled, timer}
  var areas = [];      // prepared areas (index; places are in IndexedDB "area:<id>")
  var prep = null;     // running preparation

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
    delete settings.radius; // v0.5: no radius any more, the search uses the visible map section
    cfg.suche = cfg.suche || {};
    cfg.gebiet = cfg.gebiet || {};
    if (typeof settings.minStars !== 'number') settings.minStars = 0; // v0.10.0: all, the map emphasis shows what is worth it
    if (['google', 'geo', 'osmand'].indexOf(settings.kartenApp) < 0) settings.kartenApp = cfg.karten_app_standard || 'google';
    if (settings.kat == null) settings.kat = '';
    if (['kurz', 'normal', 'ausfuehrlich'].indexOf(settings.level) < 0) settings.level = (cfg.erzaehlen && cfg.erzaehlen.standard_ausfuehrlichkeit) || 'kurz';
    if (settings.focus == null) settings.focus = '';
    if (settings.hideHeard == null) settings.hideHeard = false;
    if (settings.osm == null) settings.osm = true;
    saveSettings();

    // filters
    $('fStars').value = String(settings.minStars);
    $('fKat').innerHTML = '<option value="">Alle Typen</option>' + cfg.kategorien.map(function (k) {
      return '<option value="' + esc(k.id) + '">' + esc(k.label) + '</option>';
    }).join('') + '<option value="__osm">Nur aus OSM</option>';
    $('fKat').value = settings.kat;

    initMap();
    initSplitter();
    setListOff(!!settings.listeAus, true);
    bindUI();
    autoFullscreen();
    renderMerkCount();

    if (last && last.places && last.bbox) drawSearchArea(last.bbox);
    renderAll();
    loadAreas();
    dirInit();
  }

  // v0.8.3: the list under the map can be switched off (map on the whole screen)
  function setListOff(off, quiet) {
    settings.listeAus = !!off; saveSettings();
    $('app').classList.toggle('nolist', !!off);
    $('btnList').setAttribute('aria-pressed', off ? 'false' : 'true');
    $('btnList').classList.toggle('off', !!off);
    $('btnList').textContent = off ? 'Liste einblenden' : 'Liste ausblenden';
    if (map) setTimeout(function () { map.invalidateSize(); scheduleMarkers(); scheduleCities(); }, 50);
    if (!quiet) toast(off ? 'Liste aus' : 'Liste an', 1200);
  }

  // ---------------------------------------------------------------- map
  function initMap() {
    var view = LS.get(K.view, null);
    map = L.map('map', { zoomControl: false, worldCopyJump: true })
      .setView(view ? [view.lat, view.lon] : [50.5, 8.5], view ? view.z : 5);
    map.attributionControl.setPrefix(false);
    window.__rfMap = map; // for the automated UI test (tools/ui-test.mjs)
    map.attributionControl.setPosition('bottomleft');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-Mitwirkende</a>'
    }).addTo(map);
    areaLayer = L.layerGroup().addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    cityLayer = L.layerGroup().addTo(map);
    map.on('zoomend', function () { renderMarkers(); scheduleCities(); });
    map.on('moveend', function () {
      scheduleCities();
      scheduleMarkers();
      scheduleDir();
      var c = map.getCenter();
      LS.set(K.view, { lat: c.lat, lon: c.lng, z: map.getZoom() });
    });
    map.on('click', function () { if (!$('sheet').hidden) closeSheet(); });
    window.addEventListener('resize', function () { map.invalidateSize(); });
  }

  // v0.9.3: no frame for the searched section any more – the directory shows more than the section, the frame confused
  function drawSearchArea() {
    if (searchCircle) { map.removeLayer(searchCircle); searchCircle = null; }
  }
  // Prepared areas (green frame)
  function drawAreas() {
    if (!areaLayer) return;
    areaLayer.clearLayers();
    areas.forEach(function (a) {
      L.rectangle([[a.bbox.south, a.bbox.west], [a.bbox.north, a.bbox.east]], {
        color: '#1a7f37', weight: 2, opacity: .6, dashArray: '2 6', fill: false, interactive: false
      }).addTo(areaLayer);
    });
  }
  function viewBbox() {
    var b = map.getBounds();
    return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  }
  function kmText(m) { return (Math.round(m / 100) / 10).toString().replace('.', ',') + ' km'; }

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

  var DOT_R = { 3: 11, 2: 8, 1: 6, 0: 6 };
  var DOT_R_IC = { 3: 13, 2: 10, 1: 9, 0: 9 };  // with symbol (v0.7.0)
  var LBL_PX = { 3: 12, 2: 11, 1: 11, 0: 11 };
  var measureCtx = null;
  function textWidth(t, px) {
    try {
      if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
      measureCtx.font = '600 ' + px + 'px system-ui, Roboto, sans-serif';
      return measureCtx.measureText(t).width;
    } catch (e) { return t.length * px * 0.55; }
  }

  // White symbols inside the dot (v0.7.0), viewBox 0 0 24 24
  var ICONS = {
    museum: 'M12 2 23 8H1zM3 10h3.5v8H3zM10.25 10h3.5v8h-3.5zM17.5 10H21v8h-3.5zM1 19.5h22V22H1z',
    kirche: 'M10.3 1h3.4v6h5.8v3.4h-5.8V23h-3.4V10.4H4.5V7h5.8z',
    schloss: 'M2 23V7h4v3h3V7h6v3h3V7h4v16h-7.5v-6h-5v6z',
    denkmal: 'M9.7 1h4.6L16 17H8zM5 18.5h14V23H5z',
    aussicht: 'M12 4.5C5.5 4.5 1 12 1 12s4.5 7.5 11 7.5S23 12 23 12 18.5 4.5 12 4.5zm0 12a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z',
    natur: 'M12 1 3.5 13.5h5L5 18.5h6V23h2v-4.5h6l-3.5-5h5z'
  };
  function iconSvg(k) { return ICONS[k] ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONS[k] + '"/></svg>' : ''; }
  function dotR(p) { return (C.iconFor(p.typ, cfg) ? DOT_R_IC : DOT_R)[p.sterne] || 5; }

  function markerIcon(p, sel, label, side, tier) {
    var ic = C.iconFor(p.typ, cfg);
    var html = '<span class="mk mk' + p.sterne + (ic ? ' ic' : '') + (sel ? ' sel' : '') + (tier ? ' t-' + tier : '') + '">' + iconSvg(ic) + '</span>';
    // label: array of up to two lines (v0.9.3)
    if (label && label.length) html += '<span class="mk-lbl l' + p.sterne + (ic ? ' lic' : '') + (side === 'left' ? ' left' : '') + (tier === 'top' ? ' top' : '') + '">' + label.map(esc).join('<br>') + '</span>';
    return L.divIcon({ className: 'mk-wrap', html: html, iconSize: [36, 36], iconAnchor: [18, 18] });
  }

  // Every visible point gets a short label, unless it would overlap a more important one.
  function renderMarkers() {
    if (!map) return;
    markerLayer.clearLayers();
    if (cityMode() || ROUTE) return; // zoomed out: city stars instead of single places (v0.7.0); route: its own layer
    var mc = cfg.marker || {}, maxChars = mc.beschriftung_max_zeichen || 16, lines = mc.beschriftung_zeilen || 2;
    var zNow = map.getZoom(), zAll = (cfg.verzeichnis && cfg.verzeichnis.zoom && cfg.verzeichnis.zoom.alle) || 15;
    // v0.7.2: not too many at once – in the visible section only the most important ones (max_sichtbar);
    // where there is little (Le Brassus), everything. Same rule at every zoom.
    var vb = viewBbox(), dy = (vb.north - vb.south) * 0.05, dx = (vb.east - vb.west) * 0.05;
    var pad = { south: vb.south - dy, north: vb.north + dy, west: vb.west - dx, east: vb.east + dx };
    var shown = visiblePlaces().filter(function (p) {
      return (p.geprueft || p.id === selectedId) && C.inBbox(p, pad); // never pin unverified places
    });
    // v0.8: sights of the directory, without "Hier suchen" (those found by the search are shown as places)
    var dr = dirResult(vb);
    if (dr && settings.kat !== '__osm') {
      var have = {};
      (last && last.places || []).forEach(function (p) { if (p.wikidata) have[p.wikidata] = 1; });
      dr.orte.forEach(function (x) {
        if (have[x.q] || !C.inBbox(x, pad) || x.st < settings.minStars || (x.low && zNow < zAll)) return;
        if (settings.kat && C.typeInfo(x.typ, cfg).kategorie !== settings.kat) return;
        shown.push({ id: 'vz:' + x.q, name: x.name, lat: x.lat, lon: x.lon, sterne: x.st, score: x.score, vzScore: x.score, typ: x.typ, vz: x });
      });
    }
    shown = shown.sort(function (a, b) {
      return ((b.id === selectedId) - (a.id === selectedId)) || placeRank(a, b);
    }).slice(0, mc.max_sichtbar || 30);
    // v0.10.0: at a glance what is worth it in this section: the best `top` big with a bold name, up to `mit_name` named,
    // the rest only as a small dot; OSM only (no Wikipedia article): grey ring without a name
    var nTop = mc.top || 5, nNamed = mc.mit_name || 15, nDrawn = 0;
    var boxes = [];
    function free(bx) {
      return !boxes.some(function (o) { return bx.x1 < o.x2 && bx.x2 > o.x1 && bx.y1 < o.y2 && bx.y2 > o.y1; });
    }
    shown.forEach(function (p) {
      var sel = p.id === selectedId, osm = isOsmOnly(p);
      var tier = sel ? 'top' : osm ? 'osm' : nDrawn < nTop ? 'top' : nDrawn < nNamed ? 'name' : 'dot';
      var pt = map.latLngToContainerPoint([p.lat, p.lon]);
      var r = dotR(p) * ({ top: 1.3, dot: 0.7, osm: 0.6 }[tier] || 1), px = (LBL_PX[p.sterne] || 11) + (tier === 'top' ? 2 : 0);
      // crowded: a less important dot on top of a more important one is left out
      if (!sel && p.sterne < 3 && !free({ x1: pt.x - r, y1: pt.y - r, x2: pt.x + r, y2: pt.y + r })) return;
      if (!osm) nDrawn++;
      var label = tier === 'top' || tier === 'name' ? C.mapLabel(p.name, last && last.ort, maxChars, lines) : null, side = '';
      if (label) {
        var w = Math.max.apply(null, label.map(function (l) { return textWidth(l, px); })) + 3, hh = px * 0.6 * label.length + px * 0.15;
        var right = { x1: pt.x + r + 2, y1: pt.y - hh, x2: pt.x + r + 2 + w, y2: pt.y + hh };
        var left = { x1: pt.x - r - 2 - w, y1: right.y1, x2: pt.x - r - 2, y2: right.y2 };
        side = free(right) ? 'right' : free(left) ? 'left' : '';  // right of the dot, else left, else none
        if (side) boxes.push(side === 'right' ? right : left);
      }
      boxes.push({ x1: pt.x - r, y1: pt.y - r, x2: pt.x + r, y2: pt.y + r });
      var m = L.marker([p.lat, p.lon], {
        icon: markerIcon(p, sel, side ? label : null, side, tier), keyboard: false, title: C.displayName(p.name),
        zIndexOffset: sel ? 2500 : (tier === 'top' ? 1200 : 0) + p.sterne * 400 - (osm ? 300 : 0)
      });
      m.on('click', function (e) {
        if (e.originalEvent) L.DomEvent.stopPropagation(e);
        if (p.vz && p.vz.q) openDirPlace({ k: 'o', x: p.vz, s: p.vz.st, vz: true });
        else select(p.id, 'map');
      });
      markerLayer.addLayer(m);
    });
  }

  var markerTimer = null;
  function scheduleMarkers() { clearTimeout(markerTimer); markerTimer = setTimeout(function () { var ch = dirStars(); renderMarkers(); if (((!last || !last.places) && !ROUTE) || ch) renderList(); renderHint(); }, 120); }

  // ------------------------------------------------------ directory (v0.8)
  // Like a printed guide: the phone loads the region in tiles from Wikidata (core.prepareDirectoryTile; about 25 × 28 km,
  // 5 s each), keeps them cache_tage days (IndexedDB "vz:<tile>", list in "vz:index") and computes towns and sights
  // with stars for the visible section (core.computeDirectory). Loaded only with "Hier suchen" (v0.8.1).
  var DIR = { places: {}, mem: {}, index: {}, reading: {}, queue: [], job: null, total: 0, done: 0, manual: false, res: null, resKey: '', err: {}, lastErr: '', ready: false, missing: [] };
  var dcfg = null, dirTimer = null;
  function DZ() { return cfg.verzeichnis || {}; }
  function dirOn() { return !!(DZ().aktiv && settings.verzeichnis !== false); }
  function dirInit() {
    dcfg = C.directoryConfig(cfg);
    return withTimeout(IDB.get('vz:index'), 3000, null).then(function (ix) {
      DIR.index = ix || {}; DIR.ready = true; scheduleDir();
    });
  }
  function padBox(b, f) {
    var dy = (b.north - b.south) * f, dx = (b.east - b.west) * f;
    return { south: b.south - dy, north: b.north + dy, west: b.west - dx, east: b.east + dx };
  }
  function dirStale(k) { var e = DIR.index[k]; return !e || Date.now() - e.stand > (DZ().cache_tage || 30) * 864e5; }
  function dirKeyAt(lat, lon) { return C.tileKey(C.directoryTiles({ south: lat, north: lat + 1e-6, west: lon, east: lon + 1e-6 }, cfg)[0]); }
  function dirCovers(x) { var k = dirKeyAt(x.lat, x.lon); return !!(DIR.mem[k] && DIR.mem[k].items); }
  function scheduleDir() { clearTimeout(dirTimer); dirTimer = setTimeout(dirEnsure, 400); }
  function dirEnsure() {
    if (!map || !DIR.ready || !dirOn()) { DIR.missing = []; renderHint(); return; }
    var d = DZ(), z = map.getZoom(), tiles = C.directoryTiles(padBox(viewBbox(), 0.1), cfg);
    var missing = [], reads = [];
    tiles.forEach(function (t) {
      var k = C.tileKey(t);
      if (DIR.index[k] && !DIR.mem[k] && !DIR.reading[k]) reads.push(k);
      if (dirStale(k) && !(DIR.err[k] && Date.now() - DIR.err[k] < 10 * 60000)) missing.push(t);
    });
    if (reads.length) {
      reads.forEach(function (k) { DIR.reading[k] = 1; });
      Promise.all(reads.map(function (k) {
        return IDB.get('vz:' + k).then(function (r) {
          delete DIR.reading[k];
          if (r && r.items) DIR.mem[k] = r; else delete DIR.index[k];
        });
      })).then(function () { DIR.resKey = ''; scheduleCities(); scheduleMarkers(); });
    }
    // v0.8.1: nothing is downloaded by itself – "Hier suchen" loads the missing tiles (wish of the user)
    DIR.missing = missing;
    renderHint();
  }
  function dirQueue(tiles) {
    var c = map.getCenter(), running = DIR.job && DIR.job.k;
    var dist = function (t) { var a = (t.south + t.north) / 2 - c.lat, b = ((t.west + t.east) / 2 - c.lng) * 0.7; return a * a + b * b; };
    DIR.queue = tiles.filter(function (t) { return C.tileKey(t) !== running; }).sort(function (a, b) { return dist(a) - dist(b); });
    DIR.total = DIR.queue.length + (DIR.job ? 1 : 0); DIR.done = 0;
    dirRun();
  }
  function dirRun() {
    if (DIR.job) { renderHint(); return; }
    if (!DIR.queue.length) {
      var had = DIR.total;
      DIR.total = 0; renderHint();
      if (had && !DIR.cancelled) dirDone(false);
      DIR.cancelled = false;
      return;
    }
    var t = DIR.queue.shift(), k = C.tileKey(t), ctl = { cancelled: false };
    DIR.job = { k: k, control: ctl };
    renderHint();
    C.prepareDirectoryTile(t, dcfg, function (u, o) { return fetch(u, o); }, { control: ctl }).then(function (r) {
      DIR.mem[k] = r;
      DIR.index[k] = { stand: r.stand, n: r.items.length, kb: Math.round(JSON.stringify(r).length / 1024) };
      delete DIR.err[k];
      return IDB.set('vz:' + k, r).then(function () { return IDB.set('vz:index', DIR.index); });
    }).catch(function (e) {
      DIR.err[k] = Date.now(); DIR.lastErr = (e && e.message) || 'Fehler';
    }).then(function () {
      DIR.job = null; DIR.done++; DIR.resKey = '';
      scheduleCities(); scheduleMarkers(); refreshSettings(); scheduleDir();
      dirRun();
    });
  }
  function dirCancel() {
    DIR.queue = []; DIR.total = 0; DIR.cancelled = true;
    if (DIR.job) DIR.job.control.cancelled = true;
    DIR.err = {}; // a later zoom may try again
    renderHint();
  }
  /** Towns and sights of the directory around the section (computed again only when other tiles are involved). */
  function dirResult(b) {
    if (!dirOn() || !dcfg) return null;
    var keys = C.directoryTiles(padBox(b, 0.25), cfg).map(C.tileKey).filter(function (k) { return DIR.mem[k] && DIR.mem[k].items; }).sort();
    var key = keys.join(';');
    if (key === DIR.resKey) return DIR.res;
    var seen = {}, items = [];
    keys.forEach(function (k) { DIR.mem[k].items.forEach(function (x) { if (!seen[x.q]) { seen[x.q] = 1; items.push(x); } }); });
    DIR.res = items.length ? C.computeDirectory(items, dcfg, null, { copy: true }) : null;
    DIR.resKey = key;
    return DIR.res;
  }
  // v0.8.2: everything of the directory in the section, most important first (the map shows the first max_sichtbar)
  function dirInView(b) {
    var dr = dirResult(b);
    if (!dr) return [];
    var z = map.getZoom(), out = [], zAll = (cfg.verzeichnis.zoom && cfg.verzeichnis.zoom.alle) || 15;
    dr.staedte.forEach(function (x) { if (x.st && C.inBbox(x, b)) out.push({ k: 'c', x: x, s: x.st, vz: true }); });
    dr.orte.forEach(function (x) {
      if (!C.inBbox(x, b) || x.st < settings.minStars || (x.low && z < zAll)) return; // v0.9.3: the small ones only very close
      if (settings.kat && (settings.kat === '__osm' || C.typeInfo(x.typ, cfg).kategorie !== settings.kat)) return;
      out.push({ k: 'o', x: x, s: x.st, vz: true });
    });
    // what belongs to this zoom first (like the guide), then the rest by stars and points: where there is little, all of it
    var rank = function (it) { return (it.x.z <= z ? 100 : 0) + it.s * 10 + (it.k === 'c' && it.s >= 2 ? 15 : 0); };
    return out.sort(function (a, b2) { return (rank(b2) - rank(a)) || (b2.x.score - a.x.score); });
  }
  // ------------------------------------------------------ route (v0.9, PROJEKT.md 6b)
  // What lies between start and destination: straight line, the directory in a strip along it (loaded with the
  // same tiles as "Hier suchen"), each sight within the width for its stars and means of transport. No routing.
  var ROUTE = null, routeLine = null;
  var RT = { start: null, ziel: null, mode: 'auto', hits: { start: [], ziel: [] }, q: { start: '', ziel: '' } };
  var RT_MODES = [['auto', '🚗 Auto'], ['fahrrad', '🚲 Fahrrad'], ['fuss', '🚶 zu Fuß']];
  function routeSheet() {
    var f = function (key, label, ph) {
      var sel = RT[key];
      return '<label class="rt-lbl">' + label + '</label>' +
        '<div class="rt-row"><input type="search" class="rt-in" data-rt="' + key + '" placeholder="' + esc(ph) + '" value="' + esc(sel ? sel.name : RT.q[key]) + '" autocomplete="off" enterkeyhint="search">' +
        '<button class="btn" type="button" data-a="rtsearch" data-f="' + key + '" aria-label="Suchen">🔍</button></div>' +
        (RT.hits[key].length ? '<ul class="hits rt-hits">' + RT.hits[key].map(function (h, i) {
          return '<li><button type="button" data-a="rtpick" data-f="' + key + '" data-i="' + i + '"><b>' + esc(h.name) + '</b><span class="small"> ' + esc(h.detail || '') + '</span></button></li>';
        }).join('') + '</ul>' : '');
    };
    var html = f('start', 'Start', 'Mein Standort') + f('ziel', 'Ziel', 'Ort eingeben, z. B. Lyon') +
      '<div class="seg rt-mode" role="group" aria-label="Verkehrsmittel">' + RT_MODES.map(function (m) {
        return '<button type="button" data-a="rtmode" data-m="' + m[0] + '"' + (RT.mode === m[0] ? ' class="on"' : '') + '>' + m[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="actions"><button class="btn primary" type="button" data-a="rtgo">Strecke anzeigen</button>' +
      (ROUTE ? '<button class="btn" type="button" data-a="rtend">Strecke beenden</button>' : '') + '</div>' +
      '<p class="small">Luftlinie, keine Routenplanung. Gezeigt wird, was nahe an der Linie liegt: je mehr Sterne, desto breiter der Streifen. Geladen wird erst mit „Strecke anzeigen“.</p>';
    openSheet('Strecke', html);
    $('sheetBody').setAttribute('data-view', 'route');
  }
  function routeSearch(key) {
    var inp = document.querySelector('.rt-in[data-rt="' + key + '"]'), q = inp ? inp.value.trim() : '';
    RT.q[key] = q; RT[key] = null;
    if (!q) { RT.hits[key] = []; routeSheet(); return; }
    C.searchPlaces(q, function (u, o) { return fetch(u, o); }, viewBbox()).then(function (list) {
      RT.hits[key] = list;
      if (!list.length) toast('Nichts gefunden', 2000);
      routeSheet();
    }, function (e) { toast('Suche fehlgeschlagen: ' + e.message, 3000); });
  }
  function routeGo() {
    ['start', 'ziel'].forEach(function (k) { var inp = document.querySelector('.rt-in[data-rt="' + k + '"]'); if (inp && !RT[k]) RT.q[k] = inp.value.trim(); });
    if (!RT.ziel) { toast(RT.q.ziel ? 'Ziel: bitte 🔍 tippen und einen Treffer wählen' : 'Bitte ein Ziel eingeben', 3000); return; }
    if (!RT.start && RT.q.start) { toast('Start: bitte 🔍 tippen und einen Treffer wählen', 3000); return; }
    var startP = RT.start ? Promise.resolve(RT.start) : new Promise(function (res, rej) {
      if (userPos) { res({ name: 'Mein Standort', lat: userPos.lat, lon: userPos.lon }); return; }
      if (!navigator.geolocation) { rej(new Error('kein Standort')); return; }
      navigator.geolocation.getCurrentPosition(function (pos) {
        userPos = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }; drawUser();
        res({ name: 'Mein Standort', lat: userPos.lat, lon: userPos.lon });
      }, function () { rej(new Error('Standort nicht verfügbar')); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    });
    startP.then(function (st) { routeStart(st, RT.ziel, RT.mode); }, function (e) { toast(e.message + ' – Start eingeben', 3000); });
  }
  // v0.9.2: the route plan (core.routePlan) decides by travel time which stars count and how many stops;
  // it loads big tiles with a light query (only well-known entries), stored like the directory ("vzr:<min>:<tile>")
  function routeStart(a, b, mode) {
    var pts = [{ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }];
    var plan = C.routePlan(pts, mode, cfg), max = (cfg.korridor && cfg.korridor.max_kacheln) || 150;
    if (plan.tiles.length > max) { toast('Strecke zu lang (' + plan.tiles.length + ' Stücke) – bitte kürzer', 3500); return; }
    closeSheet();
    if (ROUTE && ROUTE.control) ROUTE.control.cancelled = true;
    ROUTE = { a: a, b: b, mode: mode, pts: pts, plan: plan, items: [], km: Math.round(plan.km), ready: false, mem: {}, done: 0, total: 0, control: { cancelled: false } };
    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline(pts.map(function (p) { return [p.lat, p.lon]; }), { color: '#0e6b7d', weight: 4, opacity: .8, dashArray: '8 6', interactive: false }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [40, 40], animate: false });
    renderAll(); scheduleCities();
    var r = ROUTE, ttl = (DZ().cache_tage || 30) * 864e5;
    var key = function (t) { return 'vzr:' + plan.minSl + ':' + C.tileKey(t); };
    // 1. what the phone has: route tiles, and directory tiles of "Hier suchen" in the strip
    var full = {};
    plan.tiles.forEach(function (t) { C.directoryTiles(t, cfg).forEach(function (u) { var k = C.tileKey(u); if (DIR.index[k]) full[k] = 1; }); });
    Promise.all(plan.tiles.map(function (t) { return IDB.get(key(t)).then(function (v) { if (v && v.items && Date.now() - v.stand < ttl) r.mem[key(t)] = v; }); })
      .concat(Object.keys(full).map(function (k) { return DIR.mem[k] ? null : IDB.get('vz:' + k).then(function (v) { if (v && v.items) DIR.mem[k] = v; }); }))).then(function () {
      r.full = Object.keys(full);
      // 2. the rest from Wikidata, one tile after the other
      var todo = plan.tiles.filter(function (t) { return !r.mem[key(t)]; });
      r.total = todo.length; r.done = 0; renderHint();
      (function next() {
        if (r.control.cancelled || ROUTE !== r) return;
        if (!todo.length) { r.loading = false; renderHint(); routeCompute(); return; }
        r.loading = true; renderHint();
        var t = todo.shift();
        C.prepareDirectoryTile(t, plan.rcfg, function (u, o) { return fetch(u, o); }, { control: r.control }).then(function (v) {
          r.mem[key(t)] = v;
          return IDB.set(key(t), v);
        }).catch(function () { r.failed = (r.failed || 0) + 1; }).then(function () { r.done++; next(); });
      })();
    });
  }
  function routeCompute() {
    var r = ROUTE;
    if (!r) return;
    var seen = {}, items = [];
    var add = function (list) { (list || []).forEach(function (x) { if (!seen[x.q]) { seen[x.q] = 1; items.push(x); } }); };
    Object.keys(r.mem).forEach(function (k) { add(r.mem[k].items); });
    (r.full || []).forEach(function (k) { if (DIR.mem[k]) add(DIR.mem[k].items); });
    var res = items.length ? C.computeDirectory(items, r.plan.rcfg, null, { copy: true }) : null;
    r.items = C.corridorPick(res, r.pts, r.mode, cfg, r.plan).map(function (it) { it.vz = true; return it; });
    r.ready = true;
    toast('Fertig: ' + r.items.length + (r.items.length === 1 ? ' Halt' : ' Halte') + ' entlang der Strecke' + (r.failed ? ' (' + r.failed + ' Stücke fehlen)' : ''), 3500);
    renderAll(); scheduleCities();
  }
  function routeCancel() {
    if (ROUTE) { ROUTE.control.cancelled = true; ROUTE.loading = false; routeCompute(); }
  }
  function routeEnd() {
    if (ROUTE && ROUTE.control) ROUTE.control.cancelled = true;
    ROUTE = null;
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    closeSheet(); renderAll(); scheduleCities(); scheduleMarkers();
  }
  function routeInView(b) {
    return (ROUTE && ROUTE.items || []).filter(function (it) {
      return C.inBbox(it.x, b) && (it.k === 'c' || it.s >= settings.minStars) && (!settings.kat || (settings.kat !== '__osm' && it.k === 'o' && C.typeInfo(it.x.typ, cfg).kategorie === settings.kat));
    }).slice().sort(function (p, q) {
      // towns with ★★/★★★ before their own sights (same spot), then by stars and points
      var r = function (it) { return it.s * 10 + (it.k === 'c' && it.s >= 2 ? 15 : 0); };
      return (r(q) - r(p)) || (q.x.score - p.x.score);
    });
  }
  function routeListHtml() {
    var r = ROUTE, mode = RT_MODES.filter(function (m) { return m[0] === r.mode; })[0];
    var vis = r.items.filter(function (it) { return it.k === 'c' || it.s >= settings.minStars; });
    DIR.listed = vis;
    var h = r.plan.hours, ht = h < 1 ? Math.max(5, Math.round(h * 60 / 5) * 5) + ' Min.' : String(Math.round(h * 2) / 2).replace('.', ',') + ' Std.';
    return '<li class="rt-head"><b>' + esc(r.a.name) + ' → ' + esc(r.b.name) + '</b><span class="small">' + esc(mode ? mode[1] : '') + ' · ' + r.km + ' km Luftlinie · ca. ' + ht + '</span>' +
      '<span class="small">' + (r.ready ? vis.length + (vis.length === 1 ? ' Halt' : ' Halte') + ', ab ' + C.starsText(r.plan.minStars) + ' (je länger die Strecke, desto wichtiger)' : 'lädt …') + '</span>' +
      '<span class="small">Luftlinie – echte Straße kann abweichen.</span>' +
      '<button class="btn" type="button" data-a="rtend2">Strecke beenden</button></li>' +
      vis.map(function (it, i) {
        var x = it.x, typ = it.k === 'c' ? 'Ort' : C.typeInfo(x.typ, cfg).label;
        return '<li class="vz-item" data-vz="' + i + '"><span class="it-stars s' + it.s + '">' + (it.s ? C.starsText(it.s) : '·') + '</span>' +
          '<span class="vz-main"><b>' + esc(C.displayName(x.name)) + '</b><span class="small">km ' + Math.round(it.along) + ' · Umweg ca. ' + (it.umweg < 1 ? '<1' : Math.round(it.umweg)) + ' km · ' + esc(typ) + '</span></span></li>';
      }).join('');
  }

  // v0.8.4: a sight of the directory opens like a search result (intro, picture, "Erzähl mir davon"):
  // on tap one request to Wikidata for its Wikipedia articles, then the usual place window
  function openDirPlace(it) {
    var x = it.x, id = 'wd:' + x.q, known = findPlace(id);
    if (known) { selectedId = id; renderMarkers(); openPlace(known); return; }
    openSheet(C.displayName(x.name), '<p class="small">Lade Wikipedia …</p>');
    var langs = ['de', 'en', 'fr', 'it', 'es', 'nl'];
    var url = 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=sitelinks&ids=' + x.q +
      '&sitefilter=' + langs.map(function (l) { return l + 'wiki'; }).join('|');
    withTimeout(fetch(url).then(function (r) { return r.json(); }), 15000, null).catch(function () { return null; }).then(function (d) {
      var sl = (d && d.entities && d.entities[x.q] && d.entities[x.q].sitelinks) || {}, artikel = {};
      langs.forEach(function (l) { if (sl[l + 'wiki']) artikel[l] = sl[l + 'wiki'].title; });
      var first = langs.filter(function (l) { return artikel[l]; })[0];
      var t = C.typeInfo(x.typ, cfg);
      var p = {
        id: id, vz: true, name: x.name, name2: '', namen: {}, lat: x.lat, lon: x.lon,
        wikidata: x.q, wikipedia: first ? first + ':' + artikel[first] : '', artikel: artikel,
        typ: x.typ, typ_label: t.label, kategorie: t.kategorie || 'sonstiges',
        quellen: ['W'], sterne: x.st || 0, score: x.score, geheimtipp: false, geprueft: true, warum: '', dauer_min: 0,
        beschreibung: '', klassen: [], sprachversionen: 0, laenge: 0, denkmal: [], unesco: !!x.unesco, ort: x.stadt || '', teile: {}
      };
      DIR.places[id] = p;
      if ($('sheet').hidden || $('sheetTitle').textContent !== C.displayName(x.name)) return; // closed in between
      selectedId = id; renderMarkers();
      openPlace(p);
    });
  }
  // after loading: a short message, and the list shows what was found
  function dirDone(already) {
    var n = dirInView(viewBbox()).length;
    toast('Fertig: ' + (n ? n + (n === 1 ? ' Ziel' : ' Ziele') + ' im Ausschnitt' : 'hier nichts gefunden'), 3000);
    if (!last || !last.places) renderList();
  }
  function estText(n) { var s = n * 6; return s < 90 ? 'ca. ' + Math.max(10, Math.round(s / 10) * 10) + ' s' : 'ca. ' + Math.round(s / 60) + ' min'; }
  // The line above "Hier suchen": what the map shows at this zoom and what "Hier suchen" will do (v0.8.1)
  function detailOk(b) { return C.circleFor(b).radius <= (cfg.suche.max_halbdiagonale_m || 10000); }
  // v0.9.4: zoomed in so far that "Hier suchen" works: ask whether to load the details (Laden / ✕ until zoomed out again)
  var DETAIL = { dismissed: false }, REGION = { dismissed: '' };
  // v0.10.0: the region (directory) is not loaded yet: ask too (Laden / ✕ until the missing part changes)
  function regionAsk() {
    if (ROUTE || busy || !dirOn() || !DIR.missing.length) return '';
    var k = DIR.missing.map(C.tileKey).join(';');
    return REGION.dismissed === k ? '' : k;
  }
  function detailAsk(b) {
    if (ROUTE || busy || (cfg.suche && cfg.suche.frage_details === false)) return false;
    if (!detailOk(b)) { DETAIL.dismissed = false; return false; }
    if (DETAIL.dismissed) return false;
    var c = { lat: (b.south + b.north) / 2, lon: (b.west + b.east) / 2 };
    return !(last && last.bbox && C.inBbox(c, last.bbox));
  }
  function renderHint() {
    var el = $('zoomHint');
    if (!el || !map) return;
    var z = map.getZoom(), d = DZ(), reg = (d.zoom && d.zoom.region) || 9, nah = (d.zoom && d.zoom.nah) || 12;
    var b = viewBbox(), n = DIR.missing.length, tooMany = dirOn() && n > (d.max_kacheln_knopf || 150), small = detailOk(b);
    var txt, btn = '';
    if (ROUTE && ROUTE.loading) { txt = 'Lade Strecke ' + Math.min(ROUTE.done + 1, ROUTE.total || 1) + '/' + (ROUTE.total || 1) + ' …'; btn = '<button type="button" data-h="rtcancel" aria-label="Abbrechen">✕</button>'; }
    else if (busy && !busyQuiet) { txt = 'Suche läuft …'; btn = '<button type="button" data-h="stop" aria-label="Abbrechen">✕</button>'; }
    else if (DIR.job || DIR.queue.length) {
      txt = 'Lade Gegend ' + Math.min(DIR.done + 1, DIR.total || 1) + '/' + (DIR.total || 1) + ' …';
      btn = '<button type="button" data-h="cancel" aria-label="Abbrechen">✕</button>';
    } else if (tooMany && !small) txt = 'Zu weit draußen – näher heranzoomen';
    else if (osmPending()) txt = 'OSM lädt noch – es kommt mehr';
    else if (detailAsk(b)) { txt = 'Details laden?'; btn = '<button type="button" data-h="detail">Laden</button><button type="button" data-h="detailx" aria-label="Nicht laden">✕</button>'; }
    else if (regionAsk()) { txt = 'Gegend laden?'; btn = '<button type="button" data-h="detail">Laden</button><button type="button" data-h="regionx" aria-label="Nicht laden">✕</button>'; }
    // v0.8.3: otherwise no hint (wish of the user); v0.9.3: also no „Hier suchen lädt die Gegend“
    el.innerHTML = txt ? '<span>' + esc(txt) + '</span>' + btn : '';
    el.hidden = !txt;
    if (!busy) $('btnHere').textContent = DIR.job || DIR.queue.length ? 'Lade ' + Math.min(DIR.done + 1, DIR.total || 1) + '/' + (DIR.total || 1) + ' …' : 'Hier suchen';
    $('btnHere').classList.toggle('dim', tooMany && !small);
  }
  // v0.9.3: OpenStreetMap is still loading in the background after the search went on without it
  function osmPending() {
    var o = last && !ROUTE && last.src && last.src.osm;
    return !!(o && Date.now() - (last.time || 0) < 20 * 60000 && (o.state === 'timeout' || o.state === 'skip') && !o.lateMs && !(o.late && !o.late.ok));
  }
  // ------------------------------------------------------ OSM files (v0.11.1)
  // Prepared by the GitHub Action osm-daten.yml (Geofabrik extract, monthly). index.json: {land, stand, erstellt, orte, kacheln: {key: count}}.
  var OSMF = { sets: [], ready: null };
  function osmFilesLoad(force) {
    // v0.11.1: no automatic update (dateien_pruefen_h 0): only the very first time, then only with "Jetzt prüfen"
    var h = cfg.osm && cfg.osm.dateien_pruefen_h, list = (cfg.osm && cfg.osm.dateien) || [], maxAge = h ? h * 3600000 : Infinity;
    var store = LS.get('rf.osmdateien', {}) || {};
    OSMF.ready = Promise.all(list.map(function (d) {
      var have = store[d.pfad];
      if (!force && have && have.idx && Date.now() - have.t < maxAge) return Promise.resolve({ d: d, idx: have.idx, t: have.t });
      return withTimeout(fetch(d.pfad + 'index.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }), 10000, null).then(function (idx) {
        if (!idx || !idx.kacheln) throw new Error('keine Daten');
        store[d.pfad] = { idx: idx, t: Date.now() };
        return { d: d, idx: idx, t: Date.now(), neu: !have || !have.idx || have.idx.stand !== idx.stand };
      }).catch(function (e) {
        return have && have.idx ? { d: d, idx: have.idx, t: have.t, fehler: e.message } : { d: d, idx: null, fehler: e.message };
      });
    })).then(function (sets) {
      OSMF.sets = sets;
      LS.set('rf.osmdateien', store);
      return sets;
    });
    return OSMF.ready;
  }
  function osmFileFor(key) {
    for (var i = 0; i < OSMF.sets.length; i++) {
      var s = OSMF.sets[i], n = s.idx && s.idx.kacheln[key];
      if (n === undefined || !s.idx) continue;
      return {
        stand: s.idx.stand,
        load: function (s, n) {
          return function () {
            if (!n) return Promise.resolve([]);
            return fetch(s.d.pfad + key + '.json?s=' + encodeURIComponent(s.idx.stand)).then(function (r) {
              if (!r.ok) throw new Error('OSM-Datei: HTTP ' + r.status);
              return r.json();
            });
          };
        }(s, n)
      };
    }
    return null;
  }
  function osmFilesReady() { return OSMF.ready ? Promise.race([OSMF.ready, new Promise(function (r) { setTimeout(r, 4000); })]) : Promise.resolve(); }
  function dataSheet() {
    var sets = OSMF.sets || [];
    var html = '<h3>🧭 OpenStreetMap</h3>' + (sets.length ? sets.map(function (s) {
      if (!s.idx) return '<p><b>' + esc(s.d.name) + '</b>: noch keine Daten' + (s.fehler ? ' (' + esc(s.fehler) + ')' : '') + '. Dort fragt die App direkt bei OpenStreetMap (Overpass).</p>';
      return '<p><b>' + esc(s.d.name) + '</b>: Daten vom <b>' + esc(dateText(s.idx.stand)) + '</b> · ' + (s.idx.orte || 0).toLocaleString('de-DE') + ' Orte.<br>' +
        '<span class="small">Im Handy zuletzt geprüft: ' + esc(dateText(s.t)) + ', ' + esc(new Date(s.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })) +
        (s.fehler ? ' · Prüfen ging nicht: ' + esc(s.fehler) : '') + '</span></p>';
    }).join('') : '<p>Keine vorbereiteten OSM-Daten eingestellt.</p>') +
      '<p class="small">Außerhalb dieser Länder fragt die App direkt bei OpenStreetMap (Overpass); das kann dauern. Nichts wird von selbst erneuert: neu aufbereitet wird nur, wenn du es auf GitHub anstößt, und ins Handy kommt es mit „Jetzt prüfen“.</p>' +
      '<div class="actions"><button class="btn primary" type="button" data-a="osmcheck">Jetzt prüfen</button>' +
      ((cfg.osm && cfg.osm.aufbereiten_url) ? '<a class="btn" href="' + esc(cfg.osm.aufbereiten_url) + '" target="_blank" rel="noopener">Neu aufbereiten ↗</a>' : '') + '</div>' +
      '<p class="small">„Neu aufbereiten“ öffnet GitHub: dort „Run workflow“ tippen. Nach etwa 3 Minuten hier „Jetzt prüfen“.</p>' +
      dirMetaHtml();
    openSheet('Daten', html);
    $('sheetBody').setAttribute('data-view', 'data');
  }
  function osmCheck() {
    toast('Prüfe OSM-Daten …', 1500);
    osmFilesLoad(true).then(function (sets) {
      var s = sets.filter(function (x) { return x.idx; })[0];
      var neu = sets.some(function (x) { return x.neu; });
      toast(!s ? 'Keine OSM-Daten erreichbar' : neu ? 'Neue OSM-Daten vom ' + dateText(s.idx.stand) : 'OSM-Daten sind aktuell (vom ' + dateText(s.idx.stand) + ')', 3500);
      if (!$('sheet').hidden && $('sheetBody').getAttribute('data-view') === 'data') dataSheet();
    });
  }
  function dirMetaHtml() {
    var d = DZ();
    if (!d.aktiv) return '';
    var keys = Object.keys(DIR.index), kb = 0, oldest = Infinity;
    keys.forEach(function (k) { kb += DIR.index[k].kb || 0; oldest = Math.min(oldest, DIR.index[k].stand); });
    return '<h3>🗺 Verzeichnis (Ziele auf der Karte)</h3>' +
      '<p class="small">' + (keys.length ? keys.length + ' Stücke gespeichert (' + (kb >= 1024 ? (Math.round(kb / 102.4) / 10).toString().replace('.', ',') + ' MB' : kb + ' KB') + '), ältestes vom ' + esc(dateText(oldest)) + '.' : 'Noch nichts gespeichert.') +
      ' Geladen wird nur, wenn du „Laden“ tippst: die Gegend im Kartenausschnitt, in Stücken von etwa 25 × 28 km (je etwa 5 Sekunden). Gespeichert ' + (d.cache_tage || 30) + ' Tage.</p>' +
      (DIR.job || DIR.queue.length ? '<p class="small">Lädt gerade: ' + Math.min(DIR.done + 1, DIR.total || 1) + ' von ' + (DIR.total || 1) + '.</p>' : '') +
      (DIR.lastErr ? '<p class="small">Letzter Fehler: ' + esc(DIR.lastErr) + '</p>' : '') +
      '<div class="actions"><button class="btn" type="button" data-a="dirclear">Verzeichnis löschen</button></div>';
  }
  function dirClear() {
    if (!confirm('Gespeichertes Verzeichnis löschen?')) return;
    dirCancel();
    DIR.mem = {}; DIR.index = {}; DIR.res = null; DIR.resKey = '';
    IDB.delPrefix('vz:').then(function () { refreshSettings(); scheduleCities(); scheduleMarkers(); scheduleDir(); });
    toast('Verzeichnis gelöscht');
  }

  // ------------------------------------------------------ city stars (v0.7.0)
  // Zoomed out: cities with stars and big sights outside cities instead of single places (PROJEKT.md 6c).
  // Data per country: own computation (IndexedDB "staedte:<code>") or the file shipped with the app (docs/staedte/<code>.json).
  var cityLayer = null, cityData = {}, cityJob = null, cityCur = null, cityTimer = null;
  function SC() { return cfg.staedte || {}; }
  function cityMode() {
    var c = SC();
    return !!(map && c.aktiv && settings.staedte !== false && map.getZoom() <= ((c.zoom && c.zoom.staedte_bis) || 11));
  }
  function landsIn(b) { return (SC().laender || []).filter(function (l) { return C.bboxOverlaps(C.bboxOf(l.bbox), b); }); }
  function landByCode(code) { return (SC().laender || []).filter(function (l) { return l.code === code; })[0] || null; }
  function fetchShipped(code) {
    return fetch('staedte/' + code + '.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function loadCityLand(code) {
    if (cityData[code] && cityData[code].then) return cityData[code];
    if (cityData[code]) return Promise.resolve(cityData[code]);
    var pr = withTimeout(IDB.get('staedte:' + code), 3000, null).then(function (own) {
      return fetchShipped(code).then(function (shipped) {
        var pick = own && (!shipped || (own.stand || 0) >= (shipped.stand || 0)) ? own : shipped;
        if (pick) pick.quelle = pick === own ? 'handy' : 'datei';
        cityData[code] = pick || { keine: true, staedte: [], orte: [] };
        return cityData[code];
      });
    });
    cityData[code] = pr;
    return pr;
  }
  function scheduleCities() {
    clearTimeout(cityTimer);
    if (cityLayer && !cityMode() && !ROUTE) { cityLayer.clearLayers(); return; }
    cityTimer = setTimeout(renderCities, 120);
  }

  function renderCities() {
    if (!cityLayer) return;
    cityLayer.clearLayers();
    if (!cityMode() && !ROUTE) return;
    var c = SC(), z = map.getZoom(), big = z <= ((c.zoom && c.zoom.nur_grosse_bis) || 8);
    var b = viewBbox(), dy = (b.north - b.south) * 0.1, dx = (b.east - b.west) * 0.1;
    var pad = { south: b.south - dy, north: b.north + dy, west: b.west - dx, east: b.east + dx };
    var list = [], waiting = false, seen = {};
    // v0.8: the directory (loaded in the phone) where there is one
    if (ROUTE) waiting = true; // v0.9: with a route only what lies along it
    (ROUTE ? routeInView(pad) : dirInView(pad)).forEach(function (it) { if (!seen[it.x.q]) { seen[it.x.q] = 1; list.push(it); } });
    if (!ROUTE) landsIn(pad).forEach(function (l) {
      var d = cityData[l.code];
      if (!d || d.then) { waiting = true; loadCityLand(l.code).then(scheduleCities); return; }
      (d.staedte || []).forEach(function (x) {
        var st = C.cityStars(x, cfg);
        if (st >= (big ? 2 : 1) && C.inBbox(x, pad) && !seen[x.q] && !dirCovers(x)) { seen[x.q] = 1; list.push({ k: 'c', x: x, s: st }); }
      });
      if (!big) (d.orte || []).forEach(function (x) { if (C.inBbox(x, pad) && !seen[x.q] && !dirCovers(x)) { seen[x.q] = 1; list.push({ k: 'o', x: x, s: C.ortStars(x.score, cfg) }); } });
    });
    // directory first, in its order (dirInView: this zoom's level first, towns with ★★/★★★ before their sights);
    // the country files only where nothing is loaded
    var rank = function (it) { return it.vz ? 0 : 1; };
    list = list.map(function (it, i) { it.i = i; return it; }).sort(function (a, b2) { return (rank(a) - rank(b2)) || (a.vz ? a.i - b2.i : (b2.s - a.s) || (b2.x.score - a.x.score)); });
    // v0.7.2: in the visible section at most max_sichtbar markers, the most important first
    var mcfg = cfg.marker || {}, nIn = 0, maxIn = mcfg.max_sichtbar || c.max_sichtbar || 30, cTop = mcfg.top || 5, cNamed = mcfg.mit_name || 15, cDrawn = 0;
    list = list.slice(0, c.max_marker || 160).filter(function (it) { if (!C.inBbox(it.x, b)) return true; return nIn++ < maxIn; });
    var boxes = [];
    function free(bx) { return !boxes.some(function (o) { return bx.x1 < o.x2 && bx.x2 > o.x1 && bx.y1 < o.y2 && bx.y2 > o.y1; }); }
    list.forEach(function (it) {
      var x = it.x, pt = map.latLngToContainerPoint([x.lat, x.lon]);
      var hw = it.k === 'c' ? (7 + 5 * it.s) : DOT_R_IC[it.s], hh = it.k === 'c' ? 9 : DOT_R_IC[it.s];
      var dot = { x1: pt.x - hw, y1: pt.y - hh, x2: pt.x + hw, y2: pt.y + hh };
      if (!free(dot) && (it.s < 3 || it.k === 'o')) return;  // crowded: drop smaller ones entirely (and sights on top of a town)
      // v0.10.0: in the section the best `top` stand out, up to `mit_name` with a name, the rest without
      var inView = C.inBbox(x, b), tier = !inView ? 'name' : cDrawn < cTop ? 'top' : cDrawn < cNamed ? 'name' : 'dot';
      if (inView) cDrawn++;
      var px = (it.k === 'c' && it.s >= 2 ? 13 : 12) + (tier === 'top' ? 2 : 0);
      var ml = it.k === 'o' ? C.mapLabel(x.name, '', (cfg.marker && cfg.marker.beschriftung_max_zeichen) || 16, (cfg.marker && cfg.marker.beschriftung_zeilen) || 2) : [C.displayName(x.name)];
      var w = Math.max.apply(null, ml.map(function (l) { return textWidth(l, px); })) + 4, lh = px * 0.6 * ml.length + px * 0.15;
      var right = { x1: pt.x + hw + 2, y1: pt.y - lh, x2: pt.x + hw + 2 + w, y2: pt.y + lh };
      var left = { x1: pt.x - hw - 2 - w, y1: right.y1, x2: pt.x - hw - 2, y2: right.y2 };
      var side = tier === 'dot' ? '' : free(right) ? 'right' : free(left) ? 'left' : '';
      boxes.push(dot);
      if (side) boxes.push(side === 'right' ? right : left);
      var lbl = side ? '<span class="ct-lbl ' + (it.k === 'o' ? 'o' : 'c' + it.s) + (side === 'left' ? ' left' : '') + (tier === 'top' ? ' top' : '') + '" style="' + (side === 'right' ? 'left:' : 'right:') + 'calc(50% + ' + (hw + 2) + 'px)">' + ml.map(esc).join('<br>') + '</span>' : '';
      var html = it.k === 'c'
        ? '<span class="ct ct' + it.s + '">' + C.starsText(it.s) + '</span>' + lbl
        : '<span class="mk mk' + it.s + ' ic t-' + tier + '">' + (iconSvg(C.iconFor(x.typ, cfg)) || iconSvg('denkmal')) + '</span>' + lbl;
      var m = L.marker([x.lat, x.lon], {
        icon: L.divIcon({ className: 'mk-wrap', html: html, iconSize: [36, 36], iconAnchor: [18, 18] }),
        keyboard: false, title: C.displayName(x.name), zIndexOffset: it.s * 400 + (it.k === 'c' ? 1500 : 0) + (tier === 'top' ? 800 : 0)
      });
      m.on('click', function (e) { if (e.originalEvent) L.DomEvent.stopPropagation(e); if (it.vz && it.k === 'o') openDirPlace(it); else openCity(it); });
      cityLayer.addLayer(m);
    });
    if (!list.length && !waiting && !cityHintShown && !dirOn()) {
      var none = landsIn(b).length === 0;
      cityHintShown = true;
      toast(none ? 'Stadt-Sterne gibt es für dieses Land noch nicht.' : 'Noch keine Stadt-Sterne geladen – ⚙ → Stadt-Sterne.', 3500);
    }
  }
  var cityHintShown = false;

  function fmtPop(n) { return n ? (n >= 1e6 ? (Math.round(n / 1e5) / 10).toString().replace('.', ',') + ' Mio.' : n.toLocaleString('de-DE')) + ' Einwohner' : ''; }
  function openCity(it) {
    var x = it.x;
    cityCur = it;
    var stand = '';
    Object.keys(cityData).some(function (k) { var d = cityData[k]; if (d && !d.then && ((d.staedte || []).indexOf(x) >= 0 || (d.orte || []).indexOf(x) >= 0)) { stand = dateText(d.stand) + (d.quelle === 'handy' ? ', im Handy berechnet' : ''); return true; } return false; });
    var html;
    if (it.k === 'c') {
      html = '<p class="stars s' + it.s + '">' + C.starsText(it.s) + ' <span class="small">Stadt · ' + x.score.toFixed(0) + ' Punkte</span></p>' +
        '<p class="small">' + [fmtPop(x.pop), x.n + ' bekannte Sehenswürdigkeiten', x.unesco ? 'UNESCO-Welterbe' : ''].filter(Boolean).join(' · ') + '</p>' +
        '<h3>Die bekanntesten</h3><ul class="city-top">' + (x.top || []).map(function (t, i) {
          return '<li><button type="button" data-a="citytop" data-i="' + i + '">' + esc(t[0]) + '</button></li>';
        }).join('') + '</ul>';
    } else {
      html = '<p class="stars s' + it.s + '">' + (it.s ? C.starsText(it.s) : '·') + ' <span class="small">' + (it.vz ? (x.stadt ? 'in ' + esc(x.stadt) : 'Ausflugsziel') : 'Ausflugsziel außerhalb von Städten') + ' · ' + esc(C.typeInfo(x.typ, cfg).label) + (x.unesco ? ' · UNESCO-Welterbe' : '') + '</span></p>';
    }
    html += '<div class="actions">' +
        (map.getZoom() < ((DZ().zoom && DZ().zoom.nah) || 12) || it.k === 'c' ? '<button class="btn primary" type="button" data-a="cityzoom">🔍 Hineinzoomen</button>' : '<button class="btn primary" type="button" data-a="cityhere">Hier suchen</button>') +
        '<a class="btn" href="' + C.cityWikiUrl(x.q) + '" target="_blank" rel="noopener">Wikipedia</a>' +
      '</div>' +
      (it.vz ? '<p class="small">Sterne sind eine Faustregel: wie bekannt es ist (Wikipedia-Sprachversionen, Seitenaufrufe, Wikivoyage) und – bei Orten – was es dort zu sehen gibt. „Hier suchen“ bringt Kurzinfos und „Erzähl mir davon“.</p>'
        : '<p class="small">Stadt-Sterne sind eine Faustregel: Summe der bekanntesten Sehenswürdigkeiten (Wikidata, Sprachversionen und Denkmalstatus)' + (stand ? ', Stand ' + esc(stand) : '') + '.</p>');
    openSheet(x.name, html);
    $('sheetBody').removeAttribute('data-place');
    $('sheetBody').setAttribute('data-view', 'city');
  }
  function cityZoom(lat, lon, z) {
    closeSheet();
    map.setView([lat, lon], z, { animate: false });
    toast('Jetzt „Laden“ tippen', 3000);
  }

  // ---- (re)compute in the phone, one country after the other
  function cityMetaHtml() {
    var c = SC();
    if (!c.aktiv) return '';
    var rows = (c.laender || []).map(function (l) {
      var d = cityData[l.code], info;
      if (cityJob && cityJob.code === l.code) info = 'wird berechnet …';
      else if (!d || d.then) info = 'noch nicht geladen';
      else if (d.keine) info = 'noch keine Daten';
      else {
        var cnt = { 3: 0, 2: 0, 1: 0 };
        (d.staedte || []).forEach(function (x) { var st = C.cityStars(x, cfg); if (st) cnt[st]++; });
        info = (cnt[1] + cnt[2] + cnt[3]) + ' Städte (★★★ ' + cnt[3] + ', ★★ ' + cnt[2] + ') · ' + (d.orte || []).length + ' Ausflugsziele · Stand ' + dateText(d.stand) +
          (d.quelle === 'handy' ? ' (im Handy)' : '') + ((d.fehler || []).length ? ' · <span class="warnc">' + d.fehler.length + ' Kacheln fehlen</span>' : '');
      }
      return '<li data-land="' + esc(l.code) + '"><b>' + esc(l.name) + '</b><span class="small">' + info + '</span>' +
        '<div class="actions"><button class="btn" type="button" data-a="cityrun"' + (cityJob ? ' disabled' : '') + '>Neu berechnen</button></div></li>';
    }).join('');
    return '<h3>⭐ Stadt-Sterne (Ausflüge)</h3>' +
      '<p class="small">Beim Herauszoomen zeigt die Karte Städte mit Sternen statt einzelner Orte (bis Zoom ' + (c.zoom.staedte_bis) + '), dazu große Ausflugsziele außerhalb von Städten. Ganz weit draußen nur ★★ und ★★★. Antippen: die bekanntesten Sehenswürdigkeiten, „Hineinzoomen und suchen“.</p>' +
      '<label class="opt"><input type="checkbox" id="showCities"' + (settings.staedte !== false ? ' checked' : '') + '> Stadt-Sterne auf der Karte zeigen</label>' +
      '<ul class="areas">' + rows + '</ul>' +
      '<div class="actions"><button class="btn wide" type="button" data-a="cityall"' + (cityJob ? ' disabled' : '') + '>Alle Länder neu berechnen</button></div>' +
      '<p class="small">„Neu berechnen“ fragt Wikidata direkt vom Handy ab und rechnet alle großen Sehenswürdigkeiten des Landes neu (je Land etwa 3–15 Minuten, die App muss offen bleiben). ' +
      'Die mitgelieferten Daten rechnet eine <a href="' + esc(c.github_workflow || '#') + '" target="_blank" rel="noopener">GitHub Action</a> (dort „Run workflow“).</p>';
  }
  function loadAllCityMeta() {
    return Promise.all((SC().laender || []).map(function (l) { return loadCityLand(l.code); }));
  }

  function cityCompute(codes) {
    if (cityJob) { toast('Es wird schon gerechnet.'); return; }
    var job = { codes: codes.slice(), code: codes[0], t0: Date.now(), cancelled: false, text: 'startet …', done: 0, total: 0, ok: [], bad: [] };
    cityJob = job;
    if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(function (l) { job.lock = l; }).catch(function () {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    job.timer = setInterval(renderCityJob, 1000);
    renderCityJob();
    var cache = new Map(), f = function (u, o) { return fetch(u, o); };
    codes.reduce(function (pr, code) {
      return pr.then(function () {
        if (job.cancelled) return;
        var l = landByCode(code);
        job.code = code; job.name = l.name; job.done = 0; job.total = 0; job.text = 'Wikidata …';
        refreshSettings();
        return C.loadCountryCities(l, cfg, f, {
          cache: cache, control: job,
          onProgress: function (d, t, n) { job.done = d; job.total = t; job.text = 'Kachel ' + d + '/' + t + ' · ' + n + ' Einträge'; renderCityJob(); }
        }).then(function (res) {
          if (job.cancelled) return;
          if (res.stats.fehler >= res.stats.kacheln) throw new Error('Wikidata nicht erreichbar');
          res.quelle = 'handy';
          return IDB.set('staedte:' + code, res).then(function () {
            cityData[code] = res; job.ok.push(l.name + ' (' + res.staedte.filter(function (x) { return C.cityStars(x, cfg) > 0; }).length + ' Städte)');
          });
        }).catch(function (e) { job.bad.push(l.name + ' (' + (e && e.message || 'Fehler') + ')'); });
      });
    }, Promise.resolve()).then(function () {
      clearInterval(job.timer);
      if (job.lock) { try { job.lock.release(); } catch (e) { /* ignore */ } }
      cityJob = null;
      renderCityJob();
      scheduleCities();
      refreshSettings();
      toast(job.cancelled ? 'Berechnung abgebrochen.' : 'Stadt-Sterne neu berechnet' + (job.ok.length ? ': ' + job.ok.join(', ') : '') +
        (job.bad.length ? '. Fehlgeschlagen: ' + job.bad.join(', ') : '') + '.', 6000);
    });
  }
  function renderCityJob() {
    var el = $('cprep');
    if (!cityJob) { el.hidden = true; el.innerHTML = ''; return; }
    var s = Math.floor((Date.now() - cityJob.t0) / 1000);
    el.innerHTML = '<span class="prep-text">⭐ <b>' + esc(cityJob.name || '') + '</b>' + (cityJob.codes.length > 1 ? ' (' + (cityJob.codes.indexOf(cityJob.code) + 1) + '/' + cityJob.codes.length + ')' : '') + ': ' +
      esc(cityJob.text || '') + ' · ' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) + '</span>' +
      '<button type="button" class="st-btn" data-a="citycancel">Abbrechen</button>' +
      (cityJob.total ? '<span class="bar"><span style="width:' + Math.round(100 * cityJob.done / cityJob.total) + '%"></span></span>' : '');
    el.hidden = false;
  }

  // ------------------------------------------------------------ splitter
  // Drag: any size. Tap: switches between "Liste groß" (small map) and "Karte groß" (v0.6.1).
  function initSplitter() {
    var wrap = $('mapWrap'), sp = $('splitter'), app = $('app');
    var saved = LS.get(K.split, null);
    if (typeof saved === 'number' && saved >= 12 && saved <= 85) wrap.style.flexBasis = saved + '%';
    var dragging = false, top0 = 0, h0 = 0, y0 = 0, moved = false;
    function setPct(pct) {
      wrap.style.flexBasis = pct + '%';
      LS.set(K.split, pct);
      map.invalidateSize();
    }
    sp.addEventListener('pointerdown', function (e) {
      dragging = true; moved = false; y0 = e.clientY; sp.classList.add('drag');
      top0 = wrap.getBoundingClientRect().top; h0 = app.getBoundingClientRect().height;
      try { sp.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      e.preventDefault();
    });
    sp.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      if (Math.abs(e.clientY - y0) > 6) moved = true;
      if (!moved) return;
      var h = Math.max(110, Math.min(h0 - 150, e.clientY - top0));
      wrap.style.flexBasis = h + 'px';
      map.invalidateSize({ pan: false });
    });
    function end(e) {
      if (!dragging) return;
      dragging = false; sp.classList.remove('drag');
      var pct = wrap.getBoundingClientRect().height / app.getBoundingClientRect().height * 100;
      if (!moved && e && e.type === 'pointerup') {
        setPct(pct >= 45 ? 22 : 70);  // tap: list big <-> map big
        return;
      }
      setPct(Math.round(Math.max(12, Math.min(85, pct))));
    }
    sp.addEventListener('pointerup', end);
    sp.addEventListener('pointercancel', end);
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

  function setBusy(b, quiet) {
    busy = b; busyQuiet = b && !!quiet;
    if (!quiet) {
      $('btnHere').disabled = b; $('btnLocate').disabled = b;
      $('btnHere').textContent = b ? 'Suche …' : 'Hier suchen';
    }
    renderHint();
  }

  function secText(ms) { return ms == null ? '' : ms < 1000 ? '<1 s' : Math.round(ms / 1000) + ' s'; }

  // Status line while searching: what is loading, seconds so far, and the buttons
  function renderBusy() {
    if (!run || run.quiet) return;
    var s = Date.now() - run.t0;
    var html = '<span>' + esc(run.text || 'Suche …') + '</span> <b class="secs">' + Math.floor(s / 1000) + ' s</b>';
    if (s >= 3000) {
      html += '<span class="st-btns">' +
        (run.phase === 'osm' && run.control.skipOsm ? '<button type="button" class="st-btn" data-a="skiposm">Ohne OSM</button>' : '') +
        '<button type="button" class="st-btn" data-a="cancel">Abbrechen</button></span>';
    }
    var st = $('status');
    st.innerHTML = html;
    st.className = 'status busy';
  }
  function endRun() {
    if (run && run.timer) clearInterval(run.timer);
    run = null;
    setBusy(false);
  }
  function cancelSearch() {
    if (!run) return;
    run.cancelled = true;
    endRun();
    renderList();
    toast('Suche abgebrochen', 1800);
  }

  function findArea(b, overlapOnly) {
    return areas.filter(function (a) {
      return a.hasPlaces && (overlapOnly ? C.bboxOverlaps(a.bbox, b) : C.bboxContains(a.bbox, b));
    })[0] || null;
  }

  /**
   * Searches the map section b ({south, west, north, east}).
   * o: {onDone, force (do not use a prepared area), quiet (keep the open place window, no hints), lateMs}
   */
  function doSearch(b, o) {
    o = o || {};
    if (busy) return;
    var circle = C.circleFor(b);
    var maxR = cfg.suche.max_halbdiagonale_m || 10000;
    if (circle.radius > maxR) {
      var sz = C.bboxSize(b);
      toast('Zu groß (' + kmText(sz.w) + ' × ' + kmText(sz.h) + ') – näher heran', 4000);
      return;
    }
    var area = !o.force && findArea(b);
    if (!area && navigator.onLine === false) area = findArea(b, true);
    if (area) { useArea(area, b, o); return; }

    setBusy(true, o.quiet);
    drawSearchArea(b);
    var r = run = { quiet: !!o.quiet, t0: Date.now(), text: 'Bestimme Ort und Sprache …', phase: 'start', control: {}, cancelled: false };
    r.timer = setInterval(renderBusy, 1000);
    renderBusy();
    var ort = '';
    getPlaceInfo(circle.lat, circle.lon).then(function (info) { return osmFilesReady().then(function () { return info; }); }).then(function (info) {
      if (r.cancelled) return null;
      ort = info.name || '';
      return C.loadPlaces({
        lat: circle.lat, lon: circle.lon, radius: circle.radius, bbox: b,
        cfg: cfg, wdCache: wdCache, osmCache: IDB, osm: settings.osm !== false,
        osmCacheOnly: !!prep, // while an area is prepared it has OpenStreetMap to itself
        langs: C.languagesFor(info, cfg),
        localLang: C.localLanguage(info, cfg),
        fetch: function (u, op) { return fetch(u, op); },
        control: r.control,
        onProgress: function (t, phase) { if (r.cancelled) return; r.text = t; r.phase = phase || r.phase; renderBusy(); },
        onOsmLate: function (info2) { osmLate(r, info2); }
      });
    }).then(function (res) {
      if (!res || r.cancelled) return;
      res.places.forEach(function (p) { p.ort = ort || ''; });
      r.result = res;
      last = {
        version: VERSION, bbox: b, lat: circle.lat, lon: circle.lon, ort: ort || '', time: Date.now(),
        places: res.places, warnings: res.warnings, src: res.stats.src, herkunft: res.stats.herkunft,
        stats: { ms: res.stats.ms, requests: res.stats.requests, perLang: res.stats.perLang, wdCached: res.stats.wdCached, wdTotal: res.stats.wdTotal, osm: res.stats.osm, tiles: res.stats.osmTiles }
      };
      if (o.lateMs) last.src.osm.lateMs = o.lateMs;
      if (!LS.set(K.last, last)) LS.del(K.last);
      saveWd();
      var keepSel = o.quiet && selectedId && res.places.some(function (x) { return x.id === selectedId; });
      if (!keepSel) {
        selectedId = null;
        if (!o.quiet && !$('sheet').hidden) closeSheet();
      }
      var sc = $('scroller'), top = sc.scrollTop;
      endRun();
      renderAll();
      if (o.quiet) sc.scrollTop = top;
      var warn = res.warnings.filter(function (w) { return !/^OpenStreetMap: keine Antwort/.test(w); }); // shown in the status line
      if (warn.length && !o.quiet) toast('Hinweis: ' + warn.join('; '), 5000);
      if (o.onDone) o.onDone();
    }).catch(function (e) {
      if (r.cancelled) return;
      endRun();
      var off = navigator.onLine === false;
      setStatus('Fehler: ' + e.message + (off ? ' – keine Internetverbindung' : ''), 'err');
    }).then(function () { if (run === r) endRun(); });
  }

  // OpenStreetMap answered after the search had gone on without it: add its places automatically (v0.6.1).
  // The tiles are in the cache now, so the repeated search is quick; the open place window stays.
  function osmLate(r, info) {
    if (r.cancelled || !last || !last.src || last.src !== (r.result && r.result.stats.src)) return;
    last.src.osm.late = { ok: info.ok, ms: info.ms };
    LS.set(K.last, last);
    if (!busy) renderList();
    renderHint();
    if (!info.ok || !last.bbox) return;
    var before = last.places.length, b = last.bbox;
    (function again(tries) {
      if (busy) { if (tries < 30) setTimeout(function () { again(tries + 1); }, 2000); return; }
      if (last.bbox !== b) return; // another search in between
      doSearch(b, { force: true, quiet: true, lateMs: info.ms, onDone: function () {
        var n = last.places.length - before;
        renderHint();
        toast(n > 0 ? 'OSM: ' + n + ' Orte dazu' : 'OSM: nichts Neues', 4000);
      } });
    })(0);
  }

  // Places from a prepared area: instant, also offline
  function useArea(a, b, o) {
    setBusy(true);
    setStatus('Lade vorbereitetes Gebiet „' + a.name + '“ …', 'busy');
    IDB.get('area:' + a.id).then(function (all) {
      if (!all || !all.length) throw new Error('Gebiet „' + a.name + '“ ist leer');
      var c = C.bboxCenter(b);
      var places = all.filter(function (p) { return C.inBbox(p, b); });
      places.forEach(function (p) { p.dist = Math.round(C.haversine(c.lat, c.lon, p.lat, p.lon)); });
      var partial = !C.bboxContains(a.bbox, b);
      drawSearchArea(b);
      last = {
        version: VERSION, bbox: b, lat: c.lat, lon: c.lon, ort: a.name, time: Date.now(), places: C.sortPlaces(places),
        warnings: partial ? ['Offline: nur der vorbereitete Teil des Ausschnitts'] : [],
        src: { area: { id: a.id, name: a.name, updated: a.updated || a.created, partial: partial } },
        herkunft: C.sourceCounts(places)
      };
      if (!LS.set(K.last, last)) LS.del(K.last);
      selectedId = null;
      if (!$('sheet').hidden) closeSheet();
      setBusy(false);
      renderAll();
      if (partial) toast('Offline: nur der vorbereitete Teil des Ausschnitts', 4000);
      if (o && o.onDone) o.onDone();
    }).catch(function (e) {
      setBusy(false);
      a.hasPlaces = false;
      doSearch(b, { force: true, onDone: o && o.onDone });
      toast(e.message, 3000);
    });
  }

  function locate() {
    if (!navigator.geolocation) { toast('Standort wird von diesem Browser nicht unterstützt.'); return; }
    setStatus('Bestimme Standort …', 'busy');
    $('btnLocate').disabled = true;
    navigator.geolocation.getCurrentPosition(function (pos) {
      $('btnLocate').disabled = false;
      userPos = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy };
      drawUser();
      map.setView([userPos.lat, userPos.lon], cfg.suche.standort_zoom || 14, { animate: false });
      // v0.8: only move the map; the search starts with "Hier suchen"
      toast('Standort gefunden', 2500);
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
    var hide = cfg.suche.ausblenden_typen || [];
    return last.places.filter(function (p) {
      if (hide.indexOf(p.typ) >= 0) return false; // v0.8.4: districts and villages add little
      var kat = !settings.kat || (settings.kat === '__osm' ? C.sourceTag(p) === 'OSM' : p.kategorie === settings.kat);
      return p.sterne >= settings.minStars && kat &&
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

  // v0.9.3: one star scale. "Hier suchen" places get the stars of the directory (the same as on the map and on routes);
  // where the directory is loaded but does not have the place (too few points), at most ★. Without the directory: as before.
  function isOsmOnly(p) { return C.sourceTag(p) === 'OSM'; }
  // v0.10.0: one order for map and list: Wikipedia before OSM only, then stars, then in the directory, then points
  function placeRank(a, b) {
    var sa = a.vzScore != null ? a.vzScore : a.score || 0, sb = b.vzScore != null ? b.vzScore : b.score || 0;
    return (isOsmOnly(a) - isOsmOnly(b)) || (b.sterne - a.sterne) || ((b.vzScore != null) - (a.vzScore != null)) || (sb - sa) || ((a.dist || 0) - (b.dist || 0));
  }
  function dirStars() {
    if (!last || !last.places) return false;
    var dr = dirOn() && last.bbox ? dirResult(last.bbox) : null;
    var byQ = {};
    if (dr) dr.orte.forEach(function (x) { byQ[x.q] = x; });
    var changed = false;
    last.places.forEach(function (p) {
      if (p._own == null) p._own = p.sterne;
      var x = p.wikidata && byQ[p.wikidata], st;
      p.vzScore = x ? x.score : undefined;
      p.vzCap = !x && dr && dirCovers(p) ? true : undefined;
      st = isOsmOnly(p) ? 0 : x ? x.st : p.vzCap ? Math.min(p._own, 1) : p._own; // v0.10.0: OSM only never with stars
      if (st !== p.sterne) { p.sterne = st; p.dauer_min = (cfg.dauer_min && cfg.dauer_min[String(st)]) || 0; changed = true; }
    });
    var before = last.places.map(function (p) { return p.id; }).join();
    last.places.sort(placeRank);
    return changed || before !== last.places.map(function (p) { return p.id; }).join();
  }
  function renderAll() {
    dirStars();
    renderMarkers();
    renderList();
    $('ortLabel').hidden = true; // v0.8.3: the name of the last search was misleading once the map was moved
  }

  function renderList() {
    var ul = $('list');
    if (ROUTE) { ul.innerHTML = routeListHtml(); if (!run) setStatus(''); return; }
    var vzl = (!last || !last.places) && map && dirOn() ? dirInView(viewBbox()) : [];
    if (vzl.length) {
      DIR.listed = vzl.slice(0, 40);
      ul.innerHTML = '<li class="empty small">' + vzl.length + ' Ziele' + (vzl.length > 40 ? ' (die 40 wichtigsten)' : '') + ' · Kurzinfos: näher heran</li>' +
        DIR.listed.map(function (it, i) {
          var x = it.x, typ = it.k === 'c' ? 'Ort' : C.typeInfo(x.typ, cfg).label;
          return '<li class="vz-item" data-vz="' + i + '"><span class="it-stars s' + it.s + '">' + (it.s ? C.starsText(it.s) : '·') + '</span>' +
            '<span class="vz-main"><b>' + esc(C.displayName(x.name)) + '</b><span class="small">' + esc(typ) + (x.stadt ? ' · ' + esc(x.stadt) : '') + '</span></span></li>';
        }).join('');
      if (!run) setStatus('');
      return;
    }
    if (!last || !last.places) {
      ul.innerHTML = '<li class="empty">Schiebe und zoome die Karte an die Gegend, die dich interessiert (oder <b>☰ → Mein Standort</b> / <b>Ort suchen</b>), dann tippe in der Zeile über der Karte auf <b>Laden</b>.<br>' +
        'Geladen wird nur der sichtbare Kartenausschnitt, und erst, wenn du tippst.</li>';
      if (!run) setStatus('');
      return;
    }
    var all = last.places, vis = visiblePlaces();
    var cnt = [0, 0, 0, 0];
    all.forEach(function (p) { cnt[p.sterne]++; });
    var txt = '★★★ ' + cnt[3] + ' · ★★ ' + cnt[2] + ' · ★ ' + cnt[1]; // place name is on the map (chip)
    if (settings.minStars > 0 && cnt[0]) txt += ' · ' + cnt[0] + ' ohne Stern';
    if (settings.kat === '__osm') txt += ' · Filter: nur aus OSM';
    if (!run) { // while searching the status line shows the progress
      var st = $('status');
      st.innerHTML = '<button type="button" class="st-info" data-a="details"><span>' + esc(txt) + '</span>' +
        '<span class="src-line">' + esc(srcLine(last)) + ' ›</span></button>';
      st.className = 'status';
    }
    if (!vis.length) {
      ul.innerHTML = '<li class="empty">Keine Orte mit diesen Filtern. Stelle oben „Alle Orte“ oder eine andere Kategorie ein.</li>';
      return;
    }
    var dt = cfg.dauer_text || {}, nW = 0, osmHead = false, topN = (cfg.marker && cfg.marker.top) || 5;
    // v0.10.0: the best first ("Lohnt am meisten"), then the rest, OSM only at the end
    var sec = function (p) {
      if (isOsmOnly(p)) { if (osmHead) return ''; osmHead = true; return '<li class="list-sec">Weitere (nur OpenStreetMap, ohne Wikipedia)</li>'; }
      nW++;
      return nW === 1 ? '<li class="list-sec">Lohnt am meisten</li>' : nW === topN + 1 ? '<li class="list-sec">Weitere</li>' : '';
    };
    ul.innerHTML = vis.map(function (p) {
      return sec(p) + itemHtml(p);
    }).join('');
    observeRows();
  }
  function itemHtml(p) {
    var dt = cfg.dauer_text || {};
    return (function () {
      var d = distOf(p);
      var meta = [heard[p.id] ? '✓ gehört' : '', p.typ_label, d != null ? C.formatDistance(d) : '', dt[String(p.sterne)] || ''].filter(Boolean).join(' · ');
      var on = isMerk(p.id);
      var tag = C.sourceTag(p);
      return '<li class="item' + (p.id === selectedId ? ' sel' : '') + (p.sterne ? '' : ' zero') + (isOsmOnly(p) ? ' osm' : '') + (heard[p.id] ? ' heard' : '') + '" data-id="' + esc(p.id) + '">' +
        '<div class="it-main">' +
          '<span class="it-stars s' + p.sterne + '">' + (p.sterne ? C.starsText(p.sterne) : '·') + '</span>' +
          '<span class="it-text"><span class="it-name">' + esc(C.displayName(p.name)) + '</span>' +
          (p.name2 && [p.name, p.typ_label].every(function (t) { return String(t || '').toLowerCase() !== String(p.name2).toLowerCase(); }) ? '<span class="it-name2">' + esc(p.name2) + '</span>' : '') +
          '<span class="it-meta">' + esc(meta) + ' <span class="it-src src-' + (tag === 'W' ? 'w' : tag === 'OSM' ? 'o' : 'wo') + '">' + tag + '</span></span>' +
          '<span class="it-desc">' + esc(kurzText(p)) + '</span>' +
          '</span></div>' +
        '<button class="it-merk' + (on ? ' on' : '') + '" type="button" aria-label="Merken">' + (on ? '★' : '☆') + '</button>' +
        '</li>';
    })();
  }

  function dateText(t) { try { return new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: '2-digit' }); } catch (e) { return ''; } }

  // Where the results come from (one short line): "📥 Offline: Gebiet „Morges“" or "🌐 Online · W ✓ 3 s · OSM ✓ 12 s"
  function srcLine(l) {
    var s = l && l.src;
    if (!s) return 'Herkunft unbekannt (alte Suche)';
    if (s.area) return '📥 Offline: Gebiet „' + s.area.name + '“' + (s.area.partial ? ', nur teilweise' : '') + ' · Stand ' + dateText(s.area.updated);
    var wFail = (l.warnings || []).some(function (w) { return /^Wikipedia /.test(w); });
    var o = s.osm || {};
    // v0.9.3: no seconds (735 s confused); clear whether more is coming
    var osm = {
      ok: 'OSM ✓',
      cache: 'OSM ✓',
      prep: 'OSM wartet (Gebiet wird vorbereitet)',
      timeout: 'OSM ⏳ lädt noch',
      skip: 'OSM ⏳ lädt noch',
      error: 'OSM ✗ Fehler',
      gross: 'OSM erst näher dran',
      off: 'OSM aus'
    }[o.state] || 'OSM ?';
    if (o.lateMs) osm = 'OSM ✓ ergänzt';
    else if (o.late) osm = o.late.ok ? 'OSM ⏳ wird eingefügt' : 'OSM ✗ keine Antwort';
    return '🌐 Online · W ' + (s.wiki.ms != null ? (wFail ? '⚠' : '✓') : '✗') + ' · ' + osm;
  }

  // Details of the last search (tap on the status line)
  function openSearchDetails() {
    if (!last) return;
    var s = last.src || {}, st = last.stats || {}, h = last.herkunft || C.sourceCounts(last.places || []);
    var rows = [];
    var sz = last.bbox ? C.bboxSize(last.bbox) : null;
    rows.push(['Ort', last.ort || '–']);
    if (sz) rows.push(['Ausschnitt', kmText(sz.w) + ' × ' + kmText(sz.h)]);
    rows.push(['Gesucht', dateText(last.time) + ', ' + new Date(last.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })]);
    if (s.area) {
      rows.push(['Quelle', 'Vorbereitetes Gebiet „' + s.area.name + '“ (Stand ' + dateText(s.area.updated) + '), ohne Internet']);
    } else {
      rows.push(['Wikipedia', s.wiki && s.wiki.ms != null ? 'fertig nach ' + secText(s.wiki.ms) + (st.perLang ? ' (' + st.perLang.replace(/ ?osm:\d+/, '') + ' Artikel)' : '') : 'keine Antwort']);
      if (st.wdTotal != null) rows.push(['Wikidata', st.wdTotal + ' Einträge, davon ' + (st.wdCached || 0) + ' gespeichert']);
      var o = s.osm || {};
      var ot = { ok: 'geladen nach ' + secText(o.ms), cache: 'aus dem Speicher (schon einmal geladen)', timeout: 'keine Antwort nach ' + secText(o.ms) + ' – lädt im Hintergrund weiter',
        skip: 'übersprungen nach ' + secText(o.ms) + ' – lädt im Hintergrund weiter', error: 'Fehler: ' + (o.error || '?'), off: 'ausgeschaltet (⚙ Einstellungen)',
        gross: 'nicht geladen: Ausschnitt größer als ' + ((cfg.osm && cfg.osm.max_kacheln) || '?') + ' OSM-Kacheln – näher heranzoomen' }[o.state] || '?';
      if (o.late) ot += o.late.ok ? '; später geladen nach ' + secText(o.late.ms) : '; auch später keine Antwort';
      rows.push(['OpenStreetMap', ot]);
      if (o.tiles) rows.push(['OSM-Kacheln', o.tiles + ', davon ' + (o.cachedTiles || 0) + ' gespeichert' + (o.server ? '; Server: ' + o.server : '')]);
      if (st.osm) rows.push(['Zusammengeführt', st.osm.byWikidata + ' über Wikidata, ' + st.osm.byName + ' über Namen; ' + st.osm.osmDup + ' OSM-Doppel']);
      if (st.requests != null) rows.push(['Anfragen', st.requests + ', gesamt ' + secText(st.ms)]);
    }
    rows.push(['Orte', (last.places || []).length + ': nur Wikipedia ' + h.w + ', nur OSM ' + h.o + ', beide ' + h.wo]);
    var html = '<table class="kv">' + rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table>' +
      ((last.warnings || []).length ? '<p class="small">Hinweise: ' + esc(last.warnings.join('; ')) + '</p>' : '') +
      '<p class="small">In der Liste steht bei jedem Ort, woher er kommt: <b>W</b> = Wikipedia, <b>OSM</b> = OpenStreetMap, <b>W+OSM</b> = in beiden gefunden.</p>' +
      (last.bbox ? '<div class="actions"><button class="btn wide" type="button" data-a="research">' + (s.area ? 'Trotzdem online neu suchen' : 'Nochmal suchen') + '</button></div>' : '');
    openSheet('Suche – Details', html);
    $('sheetBody').removeAttribute('data-place');
  }

  // ------------------------------------------------ short German info ("was ist das?")
  var kurzStore = LS.get(K.kurz, {}) || {};   // id -> {t: text, l: source language, via, d: time}
  var kurzQueue = {}, kurzTimer = null, kurzBusy = false, rowObserver = null;
  var KURZ_RETRY = 24 * 3600 * 1000;          // untranslated texts are retried after a day

  function kurzText(p) {
    var k = kurzStore[p.id];
    if (k && k.t && !(k.orig && p.kurz && !p.kurzOrig)) return k.t;
    if (p.kurz) return p.kurz;   // stored with a prepared area (v0.6)
    if (p.osmOnly) return p.beschreibung || '';
    var d = C.stripLocation(p.beschreibung);
    return d && d.toLowerCase() !== String(p.typ_label || '').toLowerCase() ? d : '';
  }
  function kurzNeeded(id) {
    var k = kurzStore[id];
    if (!k) { var p = findPlace(id); if (p && p.kurz && !p.kurzOrig) return false; }
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
      }, { root: $('scroller'), rootMargin: '150px 0px' });
    }
    Array.prototype.forEach.call(document.querySelectorAll('#list .item'), function (li) {
      if (kurzNeeded(li.getAttribute('data-id'))) rowObserver.observe(li);
    });
  }
  function scheduleKurz() { clearTimeout(kurzTimer); kurzTimer = setTimeout(runKurz, 200); }
  function saveKurz() {
    var keys = Object.keys(kurzStore);
    if (keys.length > 2500) keys.slice(0, keys.length - 2500).forEach(function (k) { delete kurzStore[k]; });
    if (!LS.set(K.kurz, kurzStore)) {  // storage full: keep the newest half (prepared areas keep their own copy)
      keys = Object.keys(kurzStore);
      keys.slice(0, Math.ceil(keys.length / 2)).forEach(function (k) { delete kurzStore[k]; });
      LS.set(K.kurz, kurzStore);
    }
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
    kurzBusy = true;
    kurzFor(places).catch(function () { /* offline: keep descriptions */ }).then(function () {
      saveKurz();
      kurzBusy = false;
      if (Object.keys(kurzQueue).length) scheduleKurz();
    });
  }
  // German short info for places (max 20 per call): Wikipedia intro, translated if needed
  function kurzFor(places, cancelled) {
    var f = function (u, o) { return fetch(u, o); };
    var order = (cfg.uebersetzung && cfg.uebersetzung.reihenfolge) || ['chrome', 'mymemory'];
    return C.loadIntros(places, f).then(function (intros) {
      // translate one after the other (gentle on the free service)
      return Object.keys(intros).reduce(function (pr, id) {
        return pr.then(function () {
          if (cancelled && cancelled()) return;
          var it = intros[id];
          if (it.lang === 'de') { kurzStore[id] = { t: it.text, l: 'de', d: Date.now() }; showKurz(id); return; }
          return C.translate(it.text, it.lang, 'de', f, order).then(function (tr) {
            kurzStore[id] = { t: C.splitSentences(tr.text).map(C.dropLocation).join(' '), l: it.lang, via: tr.via, d: Date.now() };
          }, function () {
            kurzStore[id] = { t: it.text, l: it.lang, orig: true, d: Date.now() };
          }).then(function () { showKurz(id); });
        });
      }, Promise.resolve());
    });
  }

  function findPlace(id) {
    var p = last && last.places && last.places.filter(function (x) { return x.id === id; })[0];
    return p || merk.filter(function (x) { return x.id === id; })[0] || DIR.places[id] || null;
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
    $('sheetBody').removeAttribute('data-view');
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
    if (settings.kartenApp === 'osmand') {
      return { name: C.osmandIntentUrl(p, cfg.osmand_paket), pin: C.geoPinUrl(p), label: 'In OsmAnd', target: '' };
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
    var vzRow = p.vzScore != null ? [['Sterne wie im Verzeichnis (gleicher Maßstab wie auf der Karte), Punkte', p.vzScore]]
      : p.vzCap ? [['Nicht im Verzeichnis (zu wenig Punkte): höchstens ★', null]] : [];
    var rows = p.vz ? [
      ['Punkte im Verzeichnis (Sprachversionen, Seitenaufrufe, Denkmal, Art)', p.score]
    ] : p.osmOnly ? [
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
    if (!p.vz) rows = vzRow.concat(rows);
    var srcNames = { W: 'Wikipedia', O: 'OpenStreetMap', V: 'Wikivoyage', C: 'Claude-Liste' };
    var lv = settings.level;
    var foci = (cfg.erzaehlen && cfg.erzaehlen.schwerpunkte) || [];
    var html =
      '<div id="plImg" class="pl-img" hidden></div>' +
      (p.name2 ? '<p class="pl-name2">Deutsch: ' + esc(p.name2) + '</p>' : '') +
      (C.displayName(p.name) !== String(p.name).trim() ? '<p class="pl-name2">Voller Name: ' + esc(p.name) + '</p>' : '') +
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
        '<button class="btn big review-btn" type="button" data-a="review">' + esc((cfg.besucher && cfg.besucher.knopf) || '📋 Übersicht und Bewertung') + '</button>' +
        '<div id="tellStatus" class="tell-status" hidden></div>' +
        '<button class="btn heard-btn' + (heard[p.id] ? ' on' : '') + '" type="button" data-a="heard">' + (heard[p.id] ? '✓ Schon gehört' : 'Als gehört markieren') + '</button>' +
      '</div>' +
      '<div class="actions">' +
        '<button class="btn" type="button" data-a="copy">Name kopieren</button>' +
        (p.wikipedia ? '<a class="btn" href="' + esc(C.wikipediaUrl(p)) + '" target="_blank" rel="noopener">Wikipedia (' + esc(String(p.wikipedia).split(':')[0]) + ')</a>' : '') +
        '<a class="btn primary" href="' + esc(ml.name) + '"' + ml.target + '>' + ml.label + '</a>' +
        '<a class="btn" href="' + esc(ml.pin) + '"' + ml.target + '>Pin</a>' +
        '<button class="btn wide' + (on ? ' on' : '') + '" type="button" data-a="merk">' + (on ? '★ Gemerkt' : '☆ Merken') + '</button>' +
      '</div>' +
      '<details class="why"><summary>Warum ' + (p.sterne ? C.starsText(p.sterne) : 'kein Stern') + '?</summary><table>' +
        rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + (r[1] == null ? '–' : r[1].toFixed(1)) + '</td></tr>'; }).join('') +
        '<tr><td><b>Punkte</b></td><td><b>' + (p.score == null ? '–' : p.score.toFixed(1)) + '</b></td></tr>' +
      '</table><p class="small">Faustregel aus Wikipedia/Wikidata. Gewichte und Schwellen stehen in config.json.</p></details>' +
      '<details class="why" id="plIntro" hidden><summary>Wikipedia-Einleitung</summary><p class="intro" id="plIntroText"></p></details>' +
      '';
    openSheet(C.displayName(p.name), html);
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
      // article stored with a prepared area (whole article, also contains the intro): works offline
      narr.cache[key] = withTimeout(IDB.get('art:' + p.id), 1500, null).then(function (a) {
        return a && a.text ? a : C.loadArticle(p, key, function (u, o) { return fetch(u, o); });
      });
      var c = narr.cache[key];
      c.catch(function () { if (narr && narr.cache[key] === c) delete narr.cache[key]; });
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

  // v0.8.1: always Android "Teilen" – the user picks the app (Claude, Gemini, …) in the share menu.
  // The text is copied as well; without "Teilen" (some browsers) only copying is left.
  function handOver(pr, extra, t0) {
    narr.prompt = pr.text;
    return copyText(pr.text).then(function (copied) {
      var can = !!navigator.share;
      var info = (copied ? 'Prompt kopiert' : 'Kopieren nicht möglich') + ' (' + pr.length.toLocaleString('de-DE') + ' Zeichen' + (extra || '') + ').';
      var hint = can ? ' Im Teilen-Menü die App wählen (z. B. Claude oder Gemini).' : ' In der App einfügen (lange ins Eingabefeld tippen → Einfügen).';
      setTellStatus('<p>' + esc(info + hint) + '</p><div class="actions">' +
        '<button class="btn" type="button" data-a="recopy">Nochmal kopieren</button>' +
        (can ? '<button class="btn primary" type="button" data-a="aishare">Teilen …</button>' : '') + '</div>');
      // open the share menu right away if the tap is still "fresh"; otherwise the user taps "Teilen …"
      if (can && Date.now() - t0 < 4000) aiShare();
    });
  }
  function aiShare() {
    if (!narr || !narr.prompt || !navigator.share) return;
    navigator.share({ text: narr.prompt }).catch(function () { /* cancelled */ });
  }

  function markHeard(id, on) {
    if (on) heard[id] = Date.now(); else delete heard[id];
    LS.set(K.heard, heard);
    var list = $('scroller'), top = list.scrollTop;
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
          '<div class="m-main" data-a="show"><span class="s' + p.sterne + '">' + (p.sterne ? C.starsText(p.sterne) : '·') + '</span> <b>' + esc(C.displayName(p.name)) + '</b>' +
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
    var vb = viewBbox(), vs = C.bboxSize(vb), km2 = vs.w * vs.h / 1e6, maxKm2 = cfg.gebiet.max_km2 || 400;
    var html =
      '<h3>📥 Gebiet vorbereiten</h3>' +
      '<p class="small">Lädt alle Orte im Kartenausschnitt mit deutschen Kurzinfos und Wikipedia-Texten vorab. Danach ist „Hier suchen“ dort sofort fertig, auch ohne Internet (nur Bilder und Claude brauchen Internet). ' +
      'Dauert einige Minuten; die App muss dabei offen bleiben.</p>' +
      '<p class="small">Ausschnitt jetzt: <b>' + kmText(vs.w) + ' × ' + kmText(vs.h) + '</b>' + (km2 > maxKm2 ? ' – zu groß (höchstens ' + maxKm2 + ' km²), bitte näher heranzoomen.' : '') + '</p>' +
      '<div class="actions"><button class="btn primary wide" type="button" data-a="prep"' + (km2 > maxKm2 || prep ? ' disabled' : '') + '>' +
        (prep ? 'Wird gerade vorbereitet …' : 'Kartenausschnitt vorbereiten') + '</button></div>' +
      areasHtml() +
      dirMetaHtml() +
      fullscreenHtml() +
      '<h3>Karten-App für „In Google Maps“ und „Pin“</h3>' +
      [['google', 'Google Maps (Web-Link, empfohlen)'], ['geo', 'Android-Karten-App (geo:-Link, Auswahl möglich)'], ['osmand', 'OsmAnd (öffnet OsmAnd+; „Pin“ per geo:-Link)']].map(function (o) {
        return '<label class="opt"><input type="radio" name="kapp" value="' + o[0] + '"' + (settings.kartenApp === o[0] ? ' checked' : '') + '> ' + o[1] + '</label>';
      }).join('') +
      '<h3>Schon gehört</h3>' +
      '<label class="opt"><input type="checkbox" id="hideHeard"' + (settings.hideHeard ? ' checked' : '') + '> Schon gehörte Orte in Liste und Karte ausblenden</label>' +
      '<div class="actions"><button class="btn wide" type="button" data-a="clearheard">Liste „Schon gehört“ leeren (' + Object.keys(heard).length + ')</button></div>' +
      '<h3>Quellen</h3>' +
      '<label class="opt"><input type="checkbox" id="useOsm"' + (settings.osm !== false ? ' checked' : '') + '> OpenStreetMap-Orte einbeziehen (Kunstwerke, Aussichtspunkte, Denkmäler …)</label>' +
      '<h3>Daten</h3>' +
      '<div class="actions"><button class="btn wide" type="button" data-a="clearcache">Zwischenspeicher leeren</button></div>' +
      '<p class="small">Löscht die letzte Suche, Wikidata- und OpenStreetMap-Daten und Kurztexte. Merkliste, Einstellungen und vorbereitete Gebiete bleiben.</p>' +
      '<p class="small" id="storageInfo"></p>' +
      '<h3>Hilfe</h3>' +
      '<div class="actions"><a class="btn" href="diag.html">Diagnose</a>' +
      '<a class="btn" href="https://github.com/obitusde/reisefuehrer/blob/main/CHANGELOG.md" target="_blank" rel="noopener">Änderungen</a></div>' +
      '<p class="small">Sterne sind eine Faustregel aus Wikipedia/Wikidata (Sprachversionen, Artikellänge, Denkmalstatus, Art des Ortes), keine Expertenbewertung.</p>' +
      '<h3>Quellen und Lizenzen</h3>' +
      '<p class="small">Karte und Ortsnamen: © OpenStreetMap-Mitwirkende (ODbL). Orte und Texte: Wikipedia (CC BY-SA 4.0), Wikidata (CC0). ' +
      'Kartenbibliothek: Leaflet (BSD-2). Dein Standort bleibt auf dem Gerät; an die Schnittstellen gehen nur die Koordinaten der Suche.</p>' +
      '<p class="small">Version v' + VERSION + '</p>';
    openSheet('Einstellungen', html);
    $('sheetBody').removeAttribute('data-place');
    $('sheetBody').setAttribute('data-view', 'settings');
    if ((SC().laender || []).some(function (l) { return !cityData[l.code] || cityData[l.code].then; })) loadAllCityMeta().then(refreshSettings);
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(function (e) {
        if ($('storageInfo')) $('storageInfo').textContent = 'Speicher der App: ' + Math.round((e.usage || 0) / 1e5) / 10 + ' MB belegt.';
      }).catch(function () {});
    }
  }

  // ------------------------------------------- full screen (v0.6.1)
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; });
  function isInstalled() {
    return window.matchMedia && (matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches);
  }
  // v0.7.0: the manifest is "standalone" again (installing failed with "fullscreen" in v0.6.1, cause not confirmed);
  // the installed app switches to full screen itself at the first tap.
  function autoFullscreen() {
    document.addEventListener('pointerup', function go() {
      if (!isInstalled() || settings.vollbild !== true || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
      try { document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(function () {}); } catch (e) { /* ignore */ }
    }, true);
  }
  function fullscreenHtml() {
    if (isInstalled()) {
      return '<h3>Vollbild</h3><label class="opt"><input type="checkbox" id="autoFs"' + (settings.vollbild === true ? ' checked' : '') + '> Beim ersten Antippen auf Vollbild schalten (ohne Android-Leiste; Chrome zeigt dann jedes Mal einen Hinweis)</label>';
    }
    return '<h3>App installieren / Vollbild</h3>' +
      '<p class="small">Chrome-Menü ⋮ → „App installieren“ (oder „Zum Startbildschirm hinzufügen“ → „Installieren“) und vom Startbildschirm öffnen. Die installierte App läuft ohne Browserleiste; Vollbild lässt sich danach hier einschalten. ' +
      'Kommt eine Fehlermeldung: bitte Bildschirmfoto schicken; ⚙ → Diagnose → „Installieren“ zeigt, was Chrome sieht.</p>' +
      '<div class="actions">' +
        (installEvt ? '<button class="btn primary" type="button" data-a="install">📲 App installieren</button>' : '') +
        (document.documentElement.requestFullscreen ? '<button class="btn' + (installEvt ? '' : ' wide') + '" type="button" data-a="fullscreen">⛶ Vollbild jetzt</button>' : '') +
      '</div>';
  }

  // ------------------------------------------- prepared areas (v0.6)
  // Index in IndexedDB "areas"; places in "area:<id>"; whole Wikipedia articles in "art:<placeId>".

  function loadAreas() {
    withTimeout(IDB.get('areas'), 3000, null).then(function (a) {
      areas = Array.isArray(a) ? a : [];
      drawAreas();
      // a preparation that was interrupted (app closed) is "teilweise"
      areas.forEach(function (x) { if (x.status === 'laden') x.status = 'teilweise'; });
    });
  }
  function saveAreas() { return IDB.set('areas', areas); }
  function areaById(id) { return areas.filter(function (a) { return a.id === id; })[0] || null; }

  function areasHtml() {
    if (!areas.length) return '<p class="small">Noch kein Gebiet vorbereitet. Gebiete erscheinen auf der Karte grün gestrichelt.</p>';
    var old = (cfg.gebiet.veraltet_tage || 30) * 864e5;
    return '<ul class="areas">' + areas.map(function (a) {
      var c = a.counts || {}, sz = C.bboxSize(a.bbox), fe = a.fehler || {};
      var state = prep && prep.id === a.id ? 'wird vorbereitet …' : a.status === 'fertig' ? (Date.now() - (a.updated || 0) > old ? 'veraltet – bitte aktualisieren' : 'fertig') : 'unvollständig';
      var o = a.osm || {};
      var osm = settings.osm === false ? 'OSM aus' : { ok: 'OSM ✓ ' + secText(o.ms), cache: 'OSM ✓', timeout: 'OSM ✗ keine Antwort', skip: 'OSM ✗', error: 'OSM ✗ Fehler', prep: 'OSM ✗' }[o.state] || 'OSM ?';
      var soll = function (n, m) { return m != null && m !== n ? n + '/' + m : String(n || 0); };
      var probs = [];
      if (fe.texte && fe.texte.length) probs.push(fe.texte.length + ' Kurzinfos fehlen (' + fe.texte.slice(0, 3).join(', ') + (fe.texte.length > 3 ? ', …' : '') + ')');
      if (fe.artikel && fe.artikel.length) probs.push(fe.artikel.length + ' Texte fehlen (' + fe.artikel.slice(0, 3).join(', ') + (fe.artikel.length > 3 ? ', …' : '') + ')');
      if (fe.abbruch) probs.push('Abbruch: ' + fe.abbruch);
      if (c.unuebersetzt) probs.push(c.unuebersetzt + ' Kurzinfos noch nicht übersetzt');
      return '<li data-area="' + esc(a.id) + '"><b>' + esc(a.name) + '</b>' +
        '<span class="small">' + kmText(sz.w) + ' × ' + kmText(sz.h) + ' · Stand ' + dateText(a.updated || a.created) + ' · ' + state + '<br>' +
        (c.orte || 0) + ' Orte' + (c.nurOsm != null ? ' (' + c.nurOsm + ' nur aus OSM)' : '') + ' · ' + osm + '<br>' +
        soll(c.texte, c.texteSoll) + ' Kurzinfos · ' + soll(c.artikel, c.artikelSoll) + ' Texte' +
        (probs.length ? '<br><span class="warnc">' + esc(probs.join('; ')) + '</span>' : '') + '</span>' +
        '<div class="actions three">' +
          '<button class="btn" type="button" data-a="areashow">Zeigen</button>' +
          '<button class="btn" type="button" data-a="arearun"' + (prep ? ' disabled' : '') + '>' + (a.status === 'fertig' ? 'Aktualisieren' : 'Fortsetzen') + '</button>' +
          '<button class="btn danger" type="button" data-a="areadel"' + (prep && prep.id === a.id ? ' disabled' : '') + '>Löschen</button>' +
        '</div></li>';
    }).join('') + '</ul>';
  }
  function refreshSettings() {
    if (!$('sheet').hidden && $('sheetBody').getAttribute('data-view') === 'data') { dataSheet(); return; }
    if (!$('sheet').hidden && $('sheetBody').getAttribute('data-view') === 'settings') {
      var top = $('sheetBody').scrollTop;
      openSettings();
      $('sheetBody').scrollTop = top;
    }
  }

  function renderPrep() {
    var el = $('prep');
    if (!prep) { el.hidden = true; el.innerHTML = ''; return; }
    var s = Math.floor((Date.now() - prep.t0) / 1000);
    el.innerHTML = '<span class="prep-text">📥 <b>' + esc(prep.name || 'Gebiet') + '</b>: ' + esc(prep.text || '') + ' · ' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) + '</span>' +
      '<button type="button" class="st-btn" data-a="prepcancel">Abbrechen</button>' +
      (prep.total ? '<span class="bar"><span style="width:' + Math.round(100 * prep.done / prep.total) + '%"></span></span>' : '');
    el.hidden = false;
  }
  function prepStep(text, done, total) {
    if (!prep) return;
    prep.text = text; prep.done = done || 0; prep.total = total || 0;
    renderPrep();
  }

  /**
   * Prepares an area: 1. places (Wikipedia in cells, OpenStreetMap, Wikidata), 2. German short info,
   * 3. whole Wikipedia articles. Every step skips what is already there, so "Fortsetzen" is cheap.
   * b: map section for a new area; id: existing area (refresh or continue).
   */
  function prepareArea(b, id) {
    if (prep) { toast('Es wird schon ein Gebiet vorbereitet.'); return; }
    var a = id ? areaById(id) : null;
    // "Aktualisieren" (complete area): everything again; "Fortsetzen": only what is missing
    var refresh = !!(a && a.status === 'fertig');
    b = a ? a.bbox : b;
    var g = cfg.gebiet, f = function (u, o) { return fetch(u, o); };
    var p = prep = { id: a ? a.id : 'g' + Date.now(), t0: Date.now(), text: 'starte …', cancelled: false };
    var stop = function () { return p.cancelled; };
    renderPrep();
    if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(function (l) { p.lock = l; }).catch(function () {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    var c = C.bboxCenter(b), places = null, old = null;
    var fail = { texte: [], artikel: [] };
    var osmWanted = settings.osm !== false && !(cfg.osm && cfg.osm.aktiv === false);
    prepStep('bestimme Ort …');
    getPlaceInfo(c.lat, c.lon).then(function (info) {
      if (!a) {
        a = { id: p.id, name: info.name || 'Gebiet', bbox: b, created: Date.now(), status: 'laden', counts: {} };
        areas.push(a);
      }
      a.status = 'laden';
      p.name = a.name;
      saveAreas(); drawAreas(); refreshSettings();
      // 1. places (again if refreshing, or if OpenStreetMap was missing last time)
      var osmOk = !osmWanted || (a.osm && (a.osm.state === 'ok' || a.osm.state === 'cache'));
      return (a.hasPlaces ? IDB.get('area:' + a.id) : Promise.resolve(null)).then(function (stored) {
        old = stored;
        if (stored && stored.length && !refresh && osmOk) return stored;
        var cells = C.cellsFor(b, g.zelle_m || 3000);
        prepStep('1/3 Orte (' + cells.length + ' Bereiche) …');
        return C.loadPlaces({
          lat: c.lat, lon: c.lon, circles: cells, bbox: b, cfg: cfg, wdCache: wdCache, osmCache: IDB, osm: osmWanted,
          langs: C.languagesFor(info, cfg), localLang: C.localLanguage(info, cfg), fetch: f,
          osmWaitS: (cfg.osm && cfg.osm.vorbereiten_wartezeit_s) || 600,
          onProgress: function (t) { prepStep('1/3 ' + t.replace(/ …$/, '') + ' …'); }
        }).then(function (res) {
          saveWd();
          res.places.forEach(function (x) { x.ort = a.name; });
          a.warnings = res.warnings;
          a.osm = { state: res.stats.src.osm.state, ms: res.stats.src.osm.ms, els: res.stats.src.osm.els };
          // keep short infos from the last run
          var byId = {};
          (old || []).forEach(function (x) { if (x.kurz) byId[x.id] = x; });
          res.places.forEach(function (x) { var o2 = byId[x.id]; if (o2 && !x.kurz) { x.kurz = o2.kurz; x.kurzOrig = o2.kurzOrig; } });
          return res.places;
        });
      });
    }).then(function (pl) {
      places = pl;
      a.hasPlaces = true;
      a.counts = a.counts || {};
      a.counts.orte = places.length;
      a.counts.nurOsm = C.sourceCounts(places).o;
      return IDB.set('area:' + a.id, places).then(saveAreas);
    }).then(function () {
      if (stop()) return;
      // 2. short info (German), in batches of 20; texts already known from the list are taken over
      places.forEach(function (x) {
        var k = kurzStore[x.id];
        if (k && k.t && !k.orig && !x.kurz) x.kurz = k.t;
      });
      var want = places.filter(function (x) { return x.sterne >= (g.texte_ab_sternen || 1) && !x.osmOnly && x.artikel && Object.keys(x.artikel).length; });
      var need = want.filter(function (x) { return !x.kurz || x.kurzOrig; });
      var batches = [];
      for (var i = 0; i < need.length; i += 20) batches.push(need.slice(i, i + 20));
      var done = 0;
      return batches.reduce(function (pr, batch) {
        return pr.then(function () {
          if (stop()) return;
          prepStep('2/3 Kurzinfos ' + done + '/' + need.length + ' …', done, need.length);
          return kurzFor(batch, stop).catch(function () { /* counted below */ }).then(function () {
            batch.forEach(function (x) {
              var k = kurzStore[x.id];
              if (k && k.t) { x.kurz = k.t; x.kurzOrig = !!k.orig; }
              if (!x.kurz) fail.texte.push(x.name);
            });
            done += batch.length;
            saveKurz();
          });
        });
      }, Promise.resolve()).then(function () {
        a.counts.texte = want.filter(function (x) { return x.kurz; }).length;
        a.counts.texteSoll = want.length;
        a.counts.unuebersetzt = want.filter(function (x) { return x.kurz && x.kurzOrig; }).length;
        return IDB.set('area:' + a.id, places).then(saveAreas);
      });
    }).then(function () {
      if (stop()) return;
      // 3. whole articles (for "Erzähl mir davon" without internet)
      var need = places.filter(function (x) { return x.sterne >= (g.artikel_ab_sternen || 1) && x.wikipedia; });
      var done = 0, have = 0;
      a.counts.artikelSoll = need.length;
      prepStep('3/3 Texte 0/' + need.length + ' …', 0, need.length);
      return runSeq(need, 2, function (x) {
        if (stop()) return null;
        return IDB.get('art:' + x.id).then(function (o2) {
          if (o2 && o2.text && !refresh) { have++; return; }
          return C.loadArticle(x, 'full', f).then(function (art) {
            have++;
            return IDB.set('art:' + x.id, art);
          }, function (e) { fail.artikel.push(x.name + ' (' + (e && e.message || 'Fehler') + ')'); });
        }).then(function () {
          done++;
          prepStep('3/3 Texte ' + done + '/' + need.length + ' …', done, need.length);
        });
      }).then(function () { a.counts.artikel = have; });
    }).then(function () {
      a.fehler = fail;
      var osmBad = osmWanted && !(a.osm && (a.osm.state === 'ok' || a.osm.state === 'cache'));
      a.status = stop() || osmBad || fail.texte.length || fail.artikel.length ? 'teilweise' : 'fertig';
      if (!stop()) a.updated = Date.now();
      return saveAreas();
    }).then(function () {
      var nf = fail.texte.length + fail.artikel.length;
      toast(p.cancelled ? 'Vorbereitung abgebrochen – „Fortsetzen“ in ⚙ macht weiter.'
        : 'Gebiet „' + a.name + '“ ist vorbereitet: ' + a.counts.orte + ' Orte, ' + (a.counts.texte || 0) + ' Kurzinfos, ' + (a.counts.artikel || 0) + ' Texte' +
          (nf ? '. ' + nf + ' fehlgeschlagen – „Fortsetzen“ in ⚙ lädt sie nach' : '') + '.', 6000);
    }).catch(function (e) {
      if (a) { a.status = 'teilweise'; a.fehler = { texte: [], artikel: [], abbruch: e.message }; saveAreas(); }
      toast('Vorbereitung fehlgeschlagen: ' + e.message + (navigator.onLine === false ? ' (kein Internet)' : ''), 6000);
    }).then(function () {
      if (p.lock) { try { p.lock.release(); } catch (e) { /* ignore */ } }
      clearInterval(p.timer);
      prep = null;
      renderPrep();
      drawAreas();
      refreshSettings();
    });
    p.timer = setInterval(renderPrep, 1000);
  }
  // like runLimited in core: n at a time
  function runSeq(items, n, fn) {
    var i = 0;
    function worker() {
      if (i >= items.length) return Promise.resolve();
      var x = items[i++];
      return Promise.resolve(fn(x)).then(worker, worker);
    }
    var ws = [];
    for (var k = 0; k < Math.min(n, items.length); k++) ws.push(worker());
    return Promise.all(ws);
  }

  function deleteArea(id) {
    var a = areaById(id);
    if (!a || !confirm('Gebiet „' + a.name + '“ löschen?')) return;
    areas = areas.filter(function (x) { return x.id !== id; });
    saveAreas(); drawAreas();
    // remove its articles unless another area still has the place
    Promise.all([IDB.get('area:' + id)].concat(areas.map(function (x) { return IDB.get('area:' + x.id); }))).then(function (lists) {
      var keep = {};
      lists.slice(1).forEach(function (l) { (l || []).forEach(function (x) { keep[x.id] = 1; }); });
      return Promise.all((lists[0] || []).filter(function (x) { return !keep[x.id]; }).map(function (x) { return IDB.del('art:' + x.id); }));
    }).then(function () { return IDB.del('area:' + id); }).then(function () {
      toast('Gebiet gelöscht'); refreshSettings();
    });
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
      '<p class="small">Treffer in der Nähe der Karte kommen zuerst. Die Karte springt hin und sucht dort Sehenswertes im Kartenausschnitt. Ortssuche: Nominatim/© OpenStreetMap-Mitwirkende.</p>');
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
    map.setView([h.lat, h.lon], h.poi ? 15 : (cfg.suche.standort_zoom || 14), { animate: false });
    // only move the map: the user sets the section first and then taps "Hier suchen"
    if (hitMarker) { map.removeLayer(hitMarker); hitMarker = null; }
    pendingHit = h.poi ? h : null;
    if (h.poi) {
      hitMarker = L.marker([h.lat, h.lon], {
        icon: L.divIcon({ className: 'mk-wrap', html: '<div class="hit-pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        interactive: false, keyboard: false, zIndexOffset: 2500
      }).addTo(map);
    }
    toast('Jetzt Ausschnitt wählen, dann „Laden“', 4000);
  }
  /** "Hier suchen": search the visible section; after a sight was searched, open it if it is in the list. */
  function searchHere() {
    var h = pendingHit, b = viewBbox(), small = detailOk(b);
    // the directory of the section (towns, sights with stars) – only what is missing or older than cache_tage
    if (dirOn() && DIR.ready) {
      DIR.err = {}; DIR.lastErr = '';
      dirEnsure();
      var max = DZ().max_kacheln_knopf || 150;
      if (DIR.missing.length > max && !small) { toast('Zu weit draußen – näher heranzoomen', 3500); return; }
      if (DIR.missing.length) dirQueue(DIR.missing.slice(0, max));
    }
    if (!small) {
      if (!dirOn()) toast('Zu groß – näher heranzoomen', 3500);
      else if (!DIR.missing.length) dirDone(true);
      return;
    }
    doSearch(b, { onDone: h ? function () {
      // the hit stays marked until a search really ran (not when the section was too large)
      if (pendingHit === h) pendingHit = null;
      if (hitMarker && !pendingHit) { map.removeLayer(hitMarker); hitMarker = null; }
      if (!C.inBbox(h, b)) return;
      // open the nearest loaded place (within 250 m) of the searched sight
      var best = null, bd = 250;
      (last && last.places || []).forEach(function (p) {
        var d = C.haversine(h.lat, h.lon, p.lat, p.lon);
        if (d < bd) { bd = d; best = p; }
      });
      if (best) select(best.id, 'list');
      else toast('„' + h.name + '“ hat keinen Wikipedia-Eintrag hier.', 4000);
    } : null });
  }

  // ---------------------------------------------------------- UI events
  function bindUI() {
    $('btnLocate').addEventListener('click', locate);
    $('btnList').addEventListener('click', function () { setListOff(!settings.listeAus); });
    $('btnRoute').addEventListener('click', routeSheet);
    $('sheetBody').addEventListener('keydown', function (e) {
      var inp = e.target.closest && e.target.closest('.rt-in');
      if (inp && e.key === 'Enter') { e.preventDefault(); routeSearch(inp.getAttribute('data-rt')); }
    });
    $('btnHere').addEventListener('click', searchHere);
    $('btnData').addEventListener('click', dataSheet);
    C.setOsmStatic(osmFileFor);
    osmFilesLoad(false);
    // v0.10.0: one button on the map opens the menu; a tap on an entry or beside it closes it
    var menuOpen = function (on) { $('menu').hidden = !on; $('btnMenu').setAttribute('aria-expanded', on ? 'true' : 'false'); };
    $('btnMenu').addEventListener('click', function (e) { e.stopPropagation(); menuOpen($('menu').hidden); });
    $('menu').addEventListener('click', function () { setTimeout(function () { menuOpen(false); }, 0); });
    document.addEventListener('click', function (e) { if (!$('menu').hidden && !(e.target.closest && e.target.closest('#menu, #btnMenu'))) menuOpen(false); }, true);
    $('zoomHint').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-h]');
      if (!b) return;
      var h = b.getAttribute('data-h');
      if (h === 'cancel') dirCancel();
      else if (h === 'stop') cancelSearch();
      else if (h === 'rtcancel') routeCancel();
      else if (h === 'detail') searchHere();
      else if (h === 'detailx') { DETAIL.dismissed = true; renderHint(); }
      else if (h === 'regionx') { REGION.dismissed = regionAsk(); renderHint(); }

    });
    $('status').addEventListener('click', function (e) {
      var el = e.target.closest('[data-a]');
      if (!el) return;
      var a = el.getAttribute('data-a');
      if (a === 'skiposm' && run && run.control.skipOsm) { run.control.skipOsm(); run.text = 'Weiter ohne OSM …'; renderBusy(); }
      else if (a === 'cancel') cancelSearch();
      else if (a === 'details') openSearchDetails();
    });
    $('prep').addEventListener('click', function (e) {
      if (e.target.closest('[data-a="prepcancel"]') && prep) { prep.cancelled = true; prepStep('breche ab …'); }
      else openSettings();
    });
    $('cprep').addEventListener('click', function (e) {
      if (e.target.closest('[data-a="citycancel"]') && cityJob) { cityJob.cancelled = true; cityJob.text = 'breche ab …'; renderCityJob(); }
      else openSettings();
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

    $('list').addEventListener('click', function (e) {
      var vz = e.target.closest('.vz-item');
      if (e.target.closest('[data-a="rtend2"]')) { routeEnd(); return; }
      if (vz && DIR.listed) { var it = DIR.listed[+vz.getAttribute('data-vz')]; if (it) { if (it.k === 'o') openDirPlace(it); else openCity(it); } return; }
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
      } else if (a === 'aishare') {
        aiShare();
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
        if (confirm('Letzte Suche, Wikidata- und OpenStreetMap-Daten löschen? Vorbereitete Gebiete bleiben.')) {
          LS.del(K.last); LS.del(K.wd); LS.del(K.ort); LS.del(K.kurz); IDB.delPrefix('osm:');
          wdStore = {}; last = null; kurzStore = {};
          if (searchCircle) { map.removeLayer(searchCircle); searchCircle = null; }
          renderAll(); toast('Zwischenspeicher geleert');
        }
      } else if (a === 'install' && installEvt) {
        installEvt.prompt();
        installEvt.userChoice.then(function () { installEvt = null; refreshSettings(); }, function () {});
      } else if (a === 'fullscreen') {
        closeSheet();
        try { document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(function () { toast('Vollbild nicht möglich'); }); } catch (err) { toast('Vollbild nicht möglich'); }
      } else if (a === 'research') {
        var rb = last && last.bbox;
        closeSheet();
        if (rb) { map.fitBounds([[rb.south, rb.west], [rb.north, rb.east]], { animate: false }); doSearch(rb, { force: true }); }
      } else if (a === 'prep') {
        prepareArea(viewBbox());
        refreshSettings();
      } else if (a === 'cityrun') {
        cityCompute([el.closest('[data-land]').getAttribute('data-land')]);
        refreshSettings();
      } else if (a === 'cityall') {
        cityCompute((SC().laender || []).map(function (l) { return l.code; }));
        refreshSettings();
      } else if (a === 'cityhere') {
        closeSheet(); searchHere();
      } else if (a === 'rtsearch') {
        routeSearch(el.getAttribute('data-f'));
      } else if (a === 'rtpick') {
        var fk = el.getAttribute('data-f'), hh = RT.hits[fk][+el.getAttribute('data-i')];
        if (hh) { RT[fk] = { name: hh.name, lat: hh.lat, lon: hh.lon }; RT.hits[fk] = []; routeSheet(); }
      } else if (a === 'rtmode') {
        RT.mode = el.getAttribute('data-m'); routeSheet();
      } else if (a === 'rtgo') {
        routeGo();
      } else if (a === 'rtend') {
        routeEnd();
      } else if (a === 'dirclear') {
        dirClear();
      } else if (a === 'osmcheck') {
        osmCheck();
      } else if (a === 'cityzoom' && cityCur) {
        cityZoom(cityCur.x.lat, cityCur.x.lon, cityCur.k === 'c' ? 14 : 15);
      } else if (a === 'citytop' && cityCur) {
        var tp = (cityCur.x.top || [])[parseInt(el.getAttribute('data-i'), 10)];
        if (tp) cityZoom(tp[1], tp[2], 16);
      } else if (a === 'areashow' || a === 'arearun' || a === 'areadel') {
        var ar = areaById(el.closest('[data-area]').getAttribute('data-area'));
        if (!ar) return;
        if (a === 'areashow') { closeSheet(); map.fitBounds([[ar.bbox.south, ar.bbox.west], [ar.bbox.north, ar.bbox.east]], { animate: false }); }
        else if (a === 'arearun') { prepareArea(null, ar.id); refreshSettings(); }
        else deleteArea(ar.id);
      }
    });
    $('sheetBody').addEventListener('change', function (e) {
      if (e.target.id === 'focusSel') { settings.focus = e.target.value; saveSettings(); setTellStatus(''); return; }
      if (e.target.id === 'useOsm') { settings.osm = e.target.checked; saveSettings(); toast('Gilt ab der nächsten Suche'); return; }
      if (e.target.id === 'autoFs') { settings.vollbild = e.target.checked; saveSettings(); return; }
      if (e.target.id === 'showCities') { settings.staedte = e.target.checked; saveSettings(); renderMarkers(); scheduleCities(); return; }
      if (e.target.id === 'hideHeard') { settings.hideHeard = e.target.checked; saveSettings(); renderAll(); return; }
      if (e.target.name === 'kapp') {
        settings.kartenApp = e.target.value; saveSettings();
        toast({ geo: 'Karten-App: geo:-Link', osmand: 'Karten-App: OsmAnd', google: 'Karten-App: Google Maps' }[e.target.value]);
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
