/* Reiseführer – app (v0.2.0). UI only; data logic lives in core.js. */
(function () {
  'use strict';

  var VERSION = '0.2.0';
  var C = window.RF && window.RF.core;

  // ------------------------------------------------------------ storage
  var K = {
    settings: 'rf.settings', last: 'rf.last', merk: 'rf.merk', wd: 'rf.wdcache',
    ort: 'rf.ortcache', view: 'rf.view', split: 'rf.split'
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

  // -------------------------------------------------------------- state
  var cfg = null;
  var settings = LS.get(K.settings, {}) || {};
  var last = LS.get(K.last, null);       // {lat, lon, radius, ort, time, places, warnings}
  var merk = LS.get(K.merk, []) || [];   // saved place objects
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
    saveSettings();

    // filters
    $('fStars').value = String(settings.minStars);
    $('fRadius').innerHTML = radien.map(function (r) {
      return '<option value="' + r + '">' + (r < 1000 ? r + ' m' : (r / 1000) + ' km') + '</option>';
    }).join('');
    $('fRadius').value = String(settings.radius);
    $('fKat').innerHTML = '<option value="">Alle Kategorien</option>' + cfg.kategorien.map(function (k) {
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

  function markerIcon(p, sel) {
    var html = '<span class="mk mk' + p.sterne + (sel ? ' sel' : '') + '"></span>';
    if (p.sterne === 3) html += '<span class="mk-lbl">' + esc(p.name) + '</span>';
    return L.divIcon({ className: 'mk-wrap', html: html, iconSize: [36, 36], iconAnchor: [18, 18] });
  }

  function renderMarkers() {
    if (!map) return;
    markerLayer.clearLayers();
    var z = map.getZoom(), minZoomSmall = (cfg.marker && cfg.marker.stern1_ab_zoom) || 16;
    visiblePlaces().forEach(function (p) {
      var sel = p.id === selectedId;
      if (p.sterne <= 1 && z < minZoomSmall && !sel) return;
      if (!p.geprueft) return; // never pin unverified places
      var m = L.marker([p.lat, p.lon], {
        icon: markerIcon(p, sel), keyboard: false, title: p.name,
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

  function getOrt(lat, lon) {
    var key = lat.toFixed(2) + ',' + lon.toFixed(2);
    var oc = LS.get(K.ort, {}) || {};
    if (oc[key]) return Promise.resolve(oc[key]);
    var p = C.reverseGeocode(lat, lon, function (u, o) { return fetch(u, o); }).then(function (name) {
      if (name) {
        var keys = Object.keys(oc);
        if (keys.length > 200) delete oc[keys[0]];
        oc[key] = name; LS.set(K.ort, oc);
      }
      return name;
    }, function () { return ''; });
    return withTimeout(p, 6000, '');
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

  function doSearch(lat, lon, fit) {
    if (busy) return;
    setBusy(true);
    var radius = settings.radius;
    drawSearchCircle(lat, lon, radius);
    if (fit) map.fitBounds(searchCircle.getBounds(), { padding: [12, 12] });
    setStatus('Suche Orte …', 'busy');
    var ortP = getOrt(lat, lon);
    C.loadPlaces({
      lat: lat, lon: lon, radius: radius, cfg: cfg, wdCache: wdCache,
      fetch: function (u, o) { return fetch(u, o); },
      onProgress: function (t) { setStatus(t, 'busy'); }
    }).then(function (res) {
      return ortP.then(function (ort) {
        res.places.forEach(function (p) { p.ort = ort || ''; });
        last = { lat: lat, lon: lon, radius: radius, ort: ort || '', time: Date.now(), places: res.places, warnings: res.warnings };
        if (!LS.set(K.last, last)) LS.del(K.last);
        saveWd();
        selectedId = null;
        if (!$('sheet').hidden) closeSheet();
        renderAll();
        if (res.warnings.length) toast('Hinweis: ' + res.warnings.join('; '), 5000);
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
      return p.sterne >= settings.minStars && (!settings.kat || p.kategorie === settings.kat);
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
      var meta = [p.typ_label, d != null ? C.formatDistance(d) : '', dt[String(p.sterne)] || ''].filter(Boolean).join(' · ');
      var on = isMerk(p.id);
      return '<li class="item' + (p.id === selectedId ? ' sel' : '') + (p.sterne ? '' : ' zero') + '" data-id="' + esc(p.id) + '">' +
        '<div class="it-main">' +
          '<span class="it-stars s' + p.sterne + '">' + (p.sterne ? C.starsText(p.sterne) : '·') + '</span>' +
          '<span class="it-text"><span class="it-name">' + esc(p.name) + '</span>' +
          '<span class="it-meta">' + esc(meta) + '</span>' +
          (p.beschreibung ? '<span class="it-desc">' + esc(p.beschreibung) + '</span>' : '') +
          '</span></div>' +
        '<button class="it-merk' + (on ? ' on' : '') + '" type="button" aria-label="Merken">' + (on ? '★' : '☆') + '</button>' +
        '</li>';
    }).join('');
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
    $('sheetBody').scrollTop = 0;
    if ($('sheet').hidden) {
      $('sheet').hidden = false;
      try { history.pushState({ rfSheet: 1 }, ''); } catch (e) { /* ignore */ }
    }
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
    var rows = [
      ['Sprachversionen (' + p.sprachversionen + ')', t.sprachversionen],
      ['Aufrufe 90 Tage (' + (p.aufrufe90 == null ? 'unbekannt' : p.aufrufe90.toLocaleString('de-DE')) + ')', t.aufrufe],
      ['Artikellänge (' + (p.laenge || 0).toLocaleString('de-DE') + ' Bytes)', t.laenge],
      ['Denkmal/UNESCO', t.denkmal],
      ['Typ: ' + p.typ_label, t.typ]
    ];
    var html =
      '<div class="pl-stars s' + p.sterne + '">' + (p.sterne ? C.starsText(p.sterne) : '–') +
        '<span>' + esc(st[String(p.sterne)] || '') + '</span></div>' +
      '<p class="pl-meta">' + esc(meta) + '</p>' +
      (p.beschreibung ? '<p class="pl-desc">' + esc(p.beschreibung) + '</p>' : '') +
      '<div class="actions">' +
        '<button class="btn" type="button" data-a="copy">Name kopieren</button>' +
        '<button class="btn" type="button" data-a="share">Teilen</button>' +
        '<a class="btn primary" href="' + esc(ml.name) + '"' + ml.target + '>' + ml.label + '</a>' +
        '<a class="btn" href="' + esc(ml.pin) + '"' + ml.target + '>Pin</a>' +
        (p.wikipedia ? '<a class="btn" href="' + esc(C.wikipediaUrl(p)) + '" target="_blank" rel="noopener">Wikipedia</a>' : '') +
        '<a class="btn" href="' + esc(C.tripadvisorUrl(p)) + '" target="_blank" rel="noopener">Bei Tripadvisor suchen</a>' +
        '<button class="btn wide' + (on ? ' on' : '') + '" type="button" data-a="merk">' + (on ? '★ Gemerkt' : '☆ Merken') + '</button>' +
      '</div>' +
      '<details class="why"><summary>Warum ' + (p.sterne ? C.starsText(p.sterne) : 'kein Stern') + '?</summary><table>' +
        rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + (r[1] == null ? '–' : r[1].toFixed(1)) + '</td></tr>'; }).join('') +
        '<tr><td><b>Punkte</b></td><td><b>' + (p.score == null ? '–' : p.score.toFixed(1)) + '</b></td></tr>' +
      '</table><p class="small">Faustregel aus Wikipedia/Wikidata. Gewichte und Schwellen stehen in config.json.</p></details>' +
      '<p class="src">Quelle: Wikipedia (CC BY-SA 4.0), Wikidata (CC0)' + (p.ort ? ', Ortsname: Nominatim/© OpenStreetMap-Mitwirkende' : '') + '.</p>';
    openSheet(p.name, html);
    $('sheetBody').setAttribute('data-place', p.id);
  }

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
      '<h3>Daten</h3>' +
      '<div class="actions"><button class="btn wide" type="button" data-a="clearcache">Zwischenspeicher leeren</button></div>' +
      '<p class="small">Löscht gespeicherte Orte und Wikidata-Daten. Merkliste und Einstellungen bleiben.</p>' +
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

  // ---------------------------------------------------------- UI events
  function bindUI() {
    $('btnLocate').addEventListener('click', locate);
    $('btnHere').addEventListener('click', function () {
      var c = map.getCenter();
      doSearch(c.lat, c.lng, false);
    });
    $('btnMerk').addEventListener('click', openMerk);
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
      } else if (a === 'clearcache') {
        if (confirm('Gespeicherte Orte und Wikidata-Daten löschen?')) {
          LS.del(K.last); LS.del(K.wd); LS.del(K.ort);
          wdStore = {}; last = null;
          if (searchCircle) { map.removeLayer(searchCircle); searchCircle = null; }
          renderAll(); toast('Zwischenspeicher geleert');
        }
      }
    });
    $('sheetBody').addEventListener('change', function (e) {
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
