/*
 * Reiseführer – core logic (v0.2.0)
 * Shared by the app (index.html), the diagnostics page (diag.html) and Node tests.
 * No DOM access here. Network access only through the injected fetch function.
 */
(function (root, factory) {
  var core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else { root.RF = root.RF || {}; root.RF.core = core; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CORE_VERSION = '0.2.0';

  // ---------------------------------------------------------------- helpers

  function log10p(x) { return Math.log(1 + Math.max(0, x || 0)) / Math.LN10; }
  function round1(x) { return Math.round(x * 10) / 10; }

  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function formatDistance(m) {
    if (m == null || isNaN(m)) return '';
    if (m < 1000) return Math.round(m / 10) * 10 + ' m';
    if (m < 10000) return (Math.round(m / 100) / 10).toString().replace('.', ',') + ' km';
    return Math.round(m / 1000) + ' km';
  }

  function compareVersions(a, b) {
    var pa = String(a || '0').split('.').map(Number), pb = String(b || '0').split('.').map(Number);
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var x = pa[i] || 0, y = pb[i] || 0;
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  }

  function starsText(n) { return n > 0 ? new Array(n + 1).join('★') : ''; }

  // Removes a trailing disambiguation like "Name (Manchester)"
  function cleanTitle(t) { return String(t || '').replace(/\s*\([^)]*\)\s*$/, '').trim(); }

  // ------------------------------------------------------- classification

  function norm(s) {
    return ' ' + String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
  }

  // Head phrase of a Wikidata description: text before the first comma and before
  // "in/of/von/…", e.g. "Grade I listed building in Manchester" -> " grade i listed building "
  var CUT_RE = / (in|im|of|von|at|on|near|bei|der|des|am|an|für|for|from|aus|zum|zur) /;
  function headPhrase(s) {
    var n = norm(String(s || '').split(/[,;(]/)[0]);
    var m = n.search(CUT_RE);
    if (m > 0) n = n.slice(0, m + 1);
    return n;
  }

  function prepare(cfg) {
    if (cfg.__prep) return cfg.__prep;
    var byId = {};
    var types = (cfg.typen || []).map(function (t) {
      var words = (t.woerter || []).map(function (w) {
        var suffix = w.charAt(0) === '*';
        return { suffix: suffix, w: suffix ? norm(w.slice(1)).trim() : norm(w) };
      });
      var o = { id: t.id, t: t, qids: t.qids || [], words: words };
      byId[t.id] = t;
      return o;
    });
    var prep = { types: types, byId: byId };
    try { Object.defineProperty(cfg, '__prep', { value: prep, enumerable: false }); } catch (e) { /* frozen */ }
    return prep;
  }

  function lastToken(n) { var a = n.trim().split(' '); return a[a.length - 1] || ''; }
  function firstToken(n) { return n.trim().split(' ')[0] || ''; }

  function endsWithWord(n, wd) {
    if (wd.suffix) { var t = lastToken(n); return t.length >= wd.w.length && t.slice(-wd.w.length) === wd.w; }
    return n.length >= wd.w.length && n.slice(-wd.w.length) === wd.w;
  }
  function startsWithWord(n, wd) {
    if (wd.suffix) { var t = firstToken(n); return t.length >= wd.w.length && t.slice(-wd.w.length) === wd.w; }
    return n.slice(0, wd.w.length) === wd.w;
  }

  /**
   * Determines the place type.
   * 1. Wikidata class (P31), first matching type in config order.
   * 2. Head noun of the Wikidata description (en/de).
   * 3. Head noun of the article title (end or start).
   */
  function classify(p31, descs, titles, cfg) {
    var prep = prepare(cfg), types = prep.types, i, j, k;
    p31 = p31 || [];
    for (i = 0; i < types.length; i++) {
      for (j = 0; j < p31.length; j++) if (types[i].qids.indexOf(p31[j]) >= 0) return types[i].id;
    }
    var heads = (descs || []).filter(Boolean).map(headPhrase).filter(function (h) { return h.trim(); });
    for (i = 0; i < types.length; i++) {
      for (j = 0; j < heads.length; j++) {
        for (k = 0; k < types[i].words.length; k++) if (endsWithWord(heads[j], types[i].words[k])) return types[i].id;
      }
    }
    // Titles: head noun at the end ("Cathedral Gardens") wins over the start ("River Tib")
    var tn = (titles || []).filter(Boolean).map(function (t) { return headPhrase(cleanTitle(t)); });
    var tests = [endsWithWord, startsWithWord];
    for (var m = 0; m < tests.length; m++) {
      for (i = 0; i < types.length; i++) {
        for (j = 0; j < tn.length; j++) {
          for (k = 0; k < types[i].words.length; k++) if (tests[m](tn[j], types[i].words[k])) return types[i].id;
        }
      }
    }
    return 'sonstiges';
  }

  function typeInfo(id, cfg) {
    var t = prepare(cfg).byId[id];
    return t || { id: 'sonstiges', label: 'Sonstiges', gewicht: 0, kategorie: 'sonstiges' };
  }

  // ------------------------------------------------------------- scoring

  var EXCLUDED_SITES = ['commonswiki', 'specieswiki', 'metawiki', 'mediawikiwiki', 'wikidatawiki',
    'sourceswiki', 'outreachwiki', 'incubatorwiki', 'wikimaniawiki', 'foundationwiki',
    'wikifunctionswiki', 'abstractwiki', 'testwiki', 'test2wiki'];

  function sitelinkCount(sitelinks) {
    var n = 0;
    Object.keys(sitelinks || {}).forEach(function (k) {
      if (/wiki$/.test(k) && EXCLUDED_SITES.indexOf(k) < 0) n++;
    });
    return n;
  }

  function denkmalBonus(p, cfg) {
    var b = cfg.score.denkmal_bonus;
    if (p.unesco) return b.unesco;
    var h = p.denkmal || [];
    if (!h.length) return 0;
    var top = cfg.score.denkmal_hoechste_qids || [];
    for (var i = 0; i < h.length; i++) if (top.indexOf(h[i]) >= 0) return b.hoechste;
    return b.denkmal;
  }

  /** Score per PROJEKT.md section 6. Returns {score, teile}. */
  function computeScore(p, cfg) {
    var g = cfg.score.gewichte;
    var teile = {
      sprachversionen: g.sprachversionen * log10p(p.sprachversionen),
      aufrufe: p.aufrufe90 == null ? 0 : g.aufrufe90 * log10p(p.aufrufe90),
      laenge: g.artikellaenge * log10p(p.laenge),
      denkmal: denkmalBonus(p, cfg),
      typ: typeInfo(p.typ, cfg).gewicht || 0,
      quellen: (cfg.score.quellen_bonus || 0) * Math.max(0, (p.quellen || []).length - 1)
    };
    var s = 0;
    Object.keys(teile).forEach(function (k) { teile[k] = round1(teile[k]); s += teile[k]; });
    return { score: round1(s), teile: teile };
  }

  function starsFor(score, hasViews, typ, cfg) {
    var th = hasViews ? cfg.score.schwellen : cfg.score.schwellen_ohne_aufrufe;
    var s = score >= th['3'] ? 3 : score >= th['2'] ? 2 : score >= th['1'] ? 1 : 0;
    var t = typeInfo(typ, cfg);
    if (typeof t.max_sterne === 'number') s = Math.min(s, t.max_sterne);
    return s;
  }

  // --------------------------------------------------------- networking

  function getJson(url, f) {
    return f(url, { headers: { 'Accept': 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function qs(obj) {
    return Object.keys(obj).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]);
    }).join('&');
  }

  function wikipediaQueryUrl(lang, lat, lon, radius, cfg) {
    var w = cfg.wikipedia;
    return 'https://' + lang + '.wikipedia.org/w/api.php?' + qs({
      action: 'query', format: 'json', formatversion: 2, origin: '*',
      generator: 'geosearch', ggscoord: lat + '|' + lon,
      ggsradius: Math.min(10000, Math.max(10, Math.round(radius))),
      ggslimit: Math.min(500, w.limit || 500),
      prop: 'coordinates|pageprops|info|pageviews',
      colimit: 'max', ppprop: 'wikibase_item', pvipdays: w.aufrufe_tage || 60
    });
  }

  /** Loads geotagged articles around a point for one language, following "continue". */
  function loadWikipedia(lang, lat, lon, radius, cfg, f) {
    var base = wikipediaQueryUrl(lang, lat, lon, radius, cfg);
    var pages = {}, rounds = 0, requests = 0;
    function step(cont) {
      var url = base + (cont ? '&' + qs(cont) : '');
      requests++;
      return getJson(url, f).then(function (data) {
        if (data.error) throw new Error(data.error.info || data.error.code);
        var list = (data.query && data.query.pages) || [];
        if (!Array.isArray(list)) list = Object.keys(list).map(function (k) { return list[k]; });
        list.forEach(function (pg) {
          if (pg.missing || pg.ns !== 0 && pg.ns != null) return;
          var cur = pages[pg.pageid] || (pages[pg.pageid] = { lang: lang, pageid: pg.pageid, title: pg.title });
          if (pg.coordinates && pg.coordinates[0]) { cur.lat = pg.coordinates[0].lat; cur.lon = pg.coordinates[0].lon; }
          if (pg.pageprops && pg.pageprops.wikibase_item) cur.wikidata = pg.pageprops.wikibase_item;
          if (typeof pg.length === 'number') cur.length = pg.length;
          if (pg.pageviews && typeof pg.pageviews === 'object') {
            var sum = 0;
            Object.keys(pg.pageviews).forEach(function (d) { sum += pg.pageviews[d] || 0; });
            cur.views = sum;
          }
        });
        rounds++;
        if (data.continue && rounds < 15) return step(data.continue);
      });
    }
    return step(null).then(function () {
      return { lang: lang, requests: requests, pages: Object.keys(pages).map(function (k) { return pages[k]; }) };
    });
  }

  function claimIds(claims, prop) {
    return ((claims && claims[prop]) || []).map(function (c) {
      return c && c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.id;
    }).filter(Boolean);
  }

  /** Compact info kept per Wikidata item (also what is cached). */
  function compactEntity(e, cfg) {
    var claims = e.claims || {};
    var p1435 = claimIds(claims, 'P1435');
    var unescoQ = cfg.score.unesco_qids || [];
    var desc = e.descriptions || {};
    return {
      s: sitelinkCount(e.sitelinks),
      p31: claimIds(claims, 'P31'),
      h: p1435,
      u: !!(claims.P757 && claims.P757.length) || p1435.some(function (q) { return unescoQ.indexOf(q) >= 0; }),
      de: desc.de ? desc.de.value : '',
      en: desc.en ? desc.en.value : '',
      t: Date.now()
    };
  }

  function runLimited(items, limit, fn) {
    var i = 0, results = new Array(items.length);
    function worker() {
      if (i >= items.length) return Promise.resolve();
      var idx = i++;
      return Promise.resolve(fn(items[idx], idx)).then(function (r) { results[idx] = r; return worker(); });
    }
    var ws = [];
    for (var k = 0; k < Math.min(limit, items.length); k++) ws.push(worker());
    return Promise.all(ws).then(function () { return results; });
  }

  var WD_TTL = 30 * 24 * 3600 * 1000;

  /** Loads Wikidata info for ids (50 per request, max 4 in parallel), using cache {get,set}. */
  function loadWikidata(ids, cfg, f, cache, onProgress) {
    var out = {}, need = [], now = Date.now();
    ids.forEach(function (id) {
      var c = cache && cache.get(id);
      if (c && now - (c.t || 0) < WD_TTL) out[id] = c; else need.push(id);
    });
    var batches = [];
    for (var i = 0; i < need.length; i += 50) batches.push(need.slice(i, i + 50));
    var done = 0, failed = 0;
    return runLimited(batches, 4, function (batch) {
      var url = 'https://www.wikidata.org/w/api.php?' + qs({
        action: 'wbgetentities', format: 'json', origin: '*',
        ids: batch.join('|'), props: 'sitelinks|claims|descriptions', languages: 'de|en'
      });
      return getJson(url, f).then(function (data) {
        var ents = data.entities || {};
        Object.keys(ents).forEach(function (k) {
          var e = ents[k];
          if (!e || e.missing !== undefined) return;
          var info = compactEntity(e, cfg);
          out[k] = info;
          if (e.id && e.id !== k) out[e.id] = info; // redirects
          if (cache) cache.set(k, info);
        });
      }, function () { failed++; }).then(function () {
        done++;
        if (onProgress) onProgress(done, batches.length);
      });
    }).then(function () {
      return { info: out, requests: batches.length, cached: ids.length - need.length, failedBatches: failed };
    });
  }

  // ------------------------------------------------------------- places

  /**
   * Builds unified place objects (format of PROJEKT.md 5b plus internal fields).
   * langResults: [{lang, pages:[...]}, ...] in preference order (first = display language).
   */
  function buildPlaces(langResults, wd, cfg, center, aufrufeTage) {
    var groups = {}, order = [];
    langResults.forEach(function (lr) {
      lr.pages.forEach(function (pg) {
        if (pg.lat == null || pg.lon == null) return;
        var key = pg.wikidata ? 'wd:' + pg.wikidata : 'wp:' + lr.lang + ':' + pg.title;
        var g = groups[key];
        if (!g) { g = groups[key] = { key: key, wikidata: pg.wikidata || null, pages: {} }; order.push(key); }
        if (!g.pages[lr.lang]) g.pages[lr.lang] = pg;
      });
    });
    var langs = langResults.map(function (lr) { return lr.lang; });
    var days = aufrufeTage || 60;

    return order.map(function (key) {
      var g = groups[key];
      var info = g.wikidata ? wd[g.wikidata] : null;
      var artikel = {}, titles = [], longest = null, views = null, lat = null, lon = null;
      langs.forEach(function (l) {
        var pg = g.pages[l];
        if (!pg) return;
        artikel[l] = pg.title;
        titles.push(pg.title);
        if (!longest || (pg.length || 0) > (longest.length || 0)) longest = pg;
        if (typeof pg.views === 'number') views = (views || 0) + pg.views;
        if (lat == null) { lat = pg.lat; lon = pg.lon; }
      });
      var nameSrc = artikel[langs[0]] || titles[0];
      var descs = info ? [info.en, info.de] : [];
      var typ = classify(info ? info.p31 : [], descs, titles, cfg);
      var t = typeInfo(typ, cfg);
      var p = {
        id: key,
        name: cleanTitle(nameSrc),
        lat: lat, lon: lon,
        wikidata: g.wikidata,
        wikipedia: longest ? longest.lang + ':' + longest.title : '',
        artikel: artikel,
        typ: typ,
        typ_label: t.label,
        kategorie: t.kategorie || 'sonstiges',
        quellen: ['W'],
        sterne: 0,
        geheimtipp: false,
        geprueft: true,
        warum: '',
        dauer_min: 0,
        beschreibung: info ? (info.de || info.en || '') : '',
        sprachversionen: info ? info.s : Object.keys(artikel).length,
        aufrufe90: views == null ? null : Math.round(views * 90 / days),
        laenge: longest ? (longest.length || 0) : 0,
        denkmal: info ? info.h : [],
        unesco: info ? info.u : false,
        ort: ''
      };
      var sc = computeScore(p, cfg);
      p.score = sc.score;
      p.teile = sc.teile;
      p.sterne = starsFor(p.score, p.aufrufe90 != null, typ, cfg);
      p.dauer_min = (cfg.dauer_min && cfg.dauer_min[String(p.sterne)]) || 0;
      p.dist = center ? Math.round(haversine(center.lat, center.lon, p.lat, p.lon)) : null;
      return p;
    });
  }

  function sortPlaces(list) {
    return list.sort(function (a, b) {
      return (b.sterne - a.sterne) || (b.score - a.score) || ((a.dist || 0) - (b.dist || 0));
    });
  }

  /**
   * Full pipeline: Wikipedia (all configured languages) -> Wikidata -> places.
   * opts: {lat, lon, radius, cfg, fetch, wdCache, onProgress(text)}
   */
  function loadPlaces(opts) {
    var cfg = opts.cfg, f = opts.fetch, prog = opts.onProgress || function () {};
    var langs = cfg.wikipedia.sprachen || ['de', 'en'];
    var t0 = Date.now(), warnings = [];
    prog('Lade Wikipedia (' + langs.join(', ') + ') …');
    return Promise.all(langs.map(function (l) {
      return loadWikipedia(l, opts.lat, opts.lon, opts.radius, cfg, f).catch(function (e) {
        warnings.push('Wikipedia ' + l + ': ' + e.message);
        return null;
      });
    })).then(function (lrs) {
      var ok = lrs.filter(Boolean);
      if (!ok.length) throw new Error('Wikipedia nicht erreichbar (' + warnings.join('; ') + ')');
      var ids = {};
      ok.forEach(function (lr) { lr.pages.forEach(function (pg) { if (pg.wikidata) ids[pg.wikidata] = 1; }); });
      var idList = Object.keys(ids);
      prog('Lade Wikidata (' + idList.length + ' Einträge) …');
      return loadWikidata(idList, cfg, f, opts.wdCache, function (d, n) {
        prog('Lade Wikidata ' + d + '/' + n + ' …');
      }).then(function (wdr) {
        if (wdr.failedBatches) warnings.push('Wikidata: ' + wdr.failedBatches + ' Abfrage(n) fehlgeschlagen');
        var noViews = ok.every(function (lr) { return lr.pages.every(function (pg) { return pg.views == null; }); });
        if (noViews && ok.some(function (lr) { return lr.pages.length; })) warnings.push('Seitenaufrufe nicht verfügbar, Schwellen ohne Aufrufe benutzt');
        var places = sortPlaces(buildPlaces(ok, wdr.info, cfg, { lat: opts.lat, lon: opts.lon }, cfg.wikipedia.aufrufe_tage));
        return {
          places: places,
          warnings: warnings,
          stats: {
            ms: Date.now() - t0,
            perLang: ok.map(function (lr) { return lr.lang + ':' + lr.pages.length; }).join(' '),
            requests: ok.reduce(function (s, lr) { return s + lr.requests; }, 0) + wdr.requests,
            wdCached: wdr.cached
          }
        };
      });
    });
  }

  /** City/place name for "Name, Ort" via Nominatim reverse geocoding (one request per search). */
  function reverseGeocode(lat, lon, f) {
    var url = 'https://nominatim.openstreetmap.org/reverse?' + qs({
      lat: lat.toFixed(4), lon: lon.toFixed(4), format: 'jsonv2', zoom: 10, 'accept-language': 'de'
    });
    return getJson(url, f).then(function (d) {
      var a = (d && d.address) || {};
      return a.city || a.town || a.village || a.municipality || a.county || a.state || (d && d.name) || '';
    });
  }

  // --------------------------------------------------------------- links

  function nameWithPlace(p) {
    return p.ort && p.name.toLowerCase().indexOf(p.ort.toLowerCase()) < 0 ? p.name + ', ' + p.ort : p.name;
  }
  function gmapsSearchUrl(p) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(nameWithPlace(p));
  }
  function gmapsPinUrl(p) {
    return 'https://www.google.com/maps/search/?api=1&query=' + p.lat.toFixed(6) + '%2C' + p.lon.toFixed(6);
  }
  function geoSearchUrl(p) { return 'geo:0,0?q=' + encodeURIComponent(nameWithPlace(p)); }
  function geoPinUrl(p) {
    var ll = p.lat.toFixed(6) + ',' + p.lon.toFixed(6);
    return 'geo:' + ll + '?q=' + ll + '(' + encodeURIComponent(p.name) + ')';
  }
  function wikipediaUrl(p) {
    var lang = p.artikel && p.artikel.de ? 'de' : (p.wikipedia || 'en:').split(':')[0];
    var title = (p.artikel && p.artikel[lang]) || (p.wikipedia || '').replace(/^[a-z-]+:/, '');
    return 'https://' + lang + '.m.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));
  }
  function tripadvisorUrl(p) {
    return 'https://www.tripadvisor.de/Search?q=' + encodeURIComponent(nameWithPlace(p));
  }
  function merkZeile(p) {
    return [p.name, p.sterne ? starsText(p.sterne) : 'ohne Stern', p.ort || '–', gmapsSearchUrl(p)].join(' – ');
  }

  return {
    VERSION: CORE_VERSION,
    haversine: haversine, formatDistance: formatDistance, compareVersions: compareVersions,
    starsText: starsText, cleanTitle: cleanTitle, headPhrase: headPhrase,
    classify: classify, typeInfo: typeInfo, sitelinkCount: sitelinkCount,
    computeScore: computeScore, starsFor: starsFor,
    wikipediaQueryUrl: wikipediaQueryUrl, loadWikipedia: loadWikipedia, loadWikidata: loadWikidata,
    buildPlaces: buildPlaces, sortPlaces: sortPlaces, loadPlaces: loadPlaces, reverseGeocode: reverseGeocode,
    nameWithPlace: nameWithPlace, gmapsSearchUrl: gmapsSearchUrl, gmapsPinUrl: gmapsPinUrl,
    geoSearchUrl: geoSearchUrl, geoPinUrl: geoPinUrl, wikipediaUrl: wikipediaUrl,
    tripadvisorUrl: tripadvisorUrl, merkZeile: merkZeile
  };
});
