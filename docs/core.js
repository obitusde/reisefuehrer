/*
 * Reiseführer – core logic (v0.20.0)
 * Shared by the app (index.html), the diagnostics page (diag.html) and Node tests.
 * No DOM access here. Network access only through the injected fetch function.
 */
(function (root, factory) {
  var core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else { root.RF = root.RF || {}; root.RF.core = core; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CORE_VERSION = '0.20.0';

  // ---------------------------------------------------------------- helpers

  function log10p(x) { return Math.log(1 + Math.max(0, x || 0)) / Math.LN10; }
  function round1(x) { return Math.round(x * 10) / 10; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

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

  // True if the text uses only Latin letters (plus digits, punctuation, accents): readable for the user
  function isLatin(s) {
    return !!s && /^[\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]+$/u.test(String(s));
  }

  // Removes a trailing disambiguation like "Name (Manchester)"
  function cleanTitle(t) { return String(t || '').replace(/\s*\([^)]*\)\s*$/, '').trim(); }

  // ------------------------------------------------------- classification

  function norm(s) {
    return ' ' + String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
  }

  // Head phrase: text before the first comma and before "in/of/von/…",
  // e.g. "Grade I listed building in Manchester" -> " grade i listed building "
  var CUT_RE = / (in|im|of|von|at|on|near|bei|der|des|am|an|für|for|from|aus|zum|zur|de|du|des|à) /;
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
      byId[t.id] = t;
      return { id: t.id, generic: !!t.generisch, qids: t.qids || [], words: words };
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

  // First type (config order) whose word matches one of the phrases with the given test.
  function matchPhrases(types, phrases, tests) {
    for (var m = 0; m < tests.length; m++) {
      for (var i = 0; i < types.length; i++) {
        for (var j = 0; j < phrases.length; j++) {
          for (var k = 0; k < types[i].words.length; k++) if (tests[m](phrases[j], types[i].words[k])) return types[i];
        }
      }
    }
    return null;
  }

  /**
   * Determines the place type. Signals in order of trust:
   * 1. Wikidata class ids (P31) listed in config,
   * 2. names of the Wikidata classes (e.g. "research library"),
   * 3. head noun of the Wikidata description,
   * 4. head noun of the article title (end, then start).
   * A generic type (e.g. "Gebäude") only wins if no signal gives a specific type.
   */
  function classify(p31, classLabels, descs, titles, cfg) {
    var types = prepare(cfg).types, i, j;
    var found = [];
    p31 = p31 || [];
    var byQid = null;
    for (i = 0; i < types.length && !byQid; i++) {
      for (j = 0; j < p31.length; j++) if (types[i].qids.indexOf(p31[j]) >= 0) { byQid = types[i]; break; }
    }
    var heads = function (arr) { return (arr || []).filter(Boolean).map(headPhrase).filter(function (h) { return h.trim(); }); };
    var byClass = matchPhrases(types, heads(classLabels), [endsWithWord]);
    // v0.8.4: both from Wikidata – the more important type wins (ZKM: "library" and "art museum" → museum)
    var wt = function (t) { return t && !t.generic ? (typeInfo(t.id, cfg).gewicht || 0) : -99; };
    if (byQid && byClass && byQid !== byClass && wt(byClass) > wt(byQid) && wt(byQid) >= 0) { found.push(byClass, byQid); }
    else { found.push(byQid); found.push(byClass); }
    found.push(matchPhrases(types, heads(descs), [endsWithWord]));
    found.push(matchPhrases(types, heads((titles || []).map(cleanTitle)), [endsWithWord, startsWithWord]));
    var specific = found.filter(function (t) { return t && !t.generic; })[0];
    var any = found.filter(Boolean)[0];
    return (specific || any || { id: 'sonstiges' }).id;
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

  /** Score per PROJEKT.md section 6 (without page views, see CHANGELOG v0.2.1). */
  function computeScore(p, cfg) {
    var g = cfg.score.gewichte;
    var teile = {
      sprachversionen: g.sprachversionen * log10p(p.sprachversionen),
      laenge: g.artikellaenge * log10p(p.laenge),
      denkmal: denkmalBonus(p, cfg),
      typ: typeInfo(p.typ, cfg).gewicht || 0,
      quellen: (cfg.score.quellen_bonus || 0) * Math.max(0, (p.quellen || []).length - 1)
    };
    var s = 0;
    Object.keys(teile).forEach(function (k) { teile[k] = round1(teile[k]); s += teile[k]; });
    return { score: round1(s), teile: teile };
  }

  function starsFor(score, typ, cfg) {
    var th = cfg.score.schwellen;
    var s = score >= th['3'] ? 3 : score >= th['2'] ? 2 : score >= th['1'] ? 1 : 0;
    var t = typeInfo(typ, cfg);
    if (typeof t.max_sterne === 'number') s = Math.min(s, t.max_sterne);
    if (typeof t.min_sterne === 'number') s = Math.max(s, t.min_sterne);
    return s;
  }

  // --------------------------------------------------------- networking

  var FETCH_TIMEOUT = 20000;

  // Every request has a time limit, so that a hanging server never blocks the app (v0.4.1)
  function getJson(url, f, timeoutMs) {
    // (in tests FETCH_TIMEOUT is lowered; longer explicit limits are capped at three times the default)
    var ms = Math.min(timeoutMs || FETCH_TIMEOUT, FETCH_TIMEOUT * 4);
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    var req = Promise.resolve().then(function () {
      return f(url, ctrl ? { headers: { 'Accept': 'application/json' }, signal: ctrl.signal } : { headers: { 'Accept': 'application/json' } });
    }).then(function (r) {
      if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return r.json();
    });
    var to = new Promise(function (res, rej) {
      timer = setTimeout(function () {
        if (ctrl) { try { ctrl.abort(); } catch (e) { /* ignore */ } }
        var e = new Error('Zeitüberschreitung'); e.timeout = true; rej(e);
      }, ms);
    });
    return Promise.race([req, to]).then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; });
  }

  function qs(obj) {
    return Object.keys(obj).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]);
    }).join('&');
  }

  function isTransient(e) {
    return (e && (e.status === 429 || e.status >= 500 || e.timeout)) || /busy|too many|try again|timeout/i.test((e && e.message) || '');
  }

  // Retries transient failures (Wikipedia "Search is currently too busy", HTTP 429/5xx)
  function getJsonRetry(url, f, delays, timeoutMs) {
    delays = delays || [1500, 3000];
    var attempt = 0;
    function go() {
      return getJson(url, f, timeoutMs).then(function (d) {
        if (d && d.error) { var e = new Error(d.error.info || d.error.code || 'API-Fehler'); e.api = true; throw e; }
        return d;
      }).catch(function (e) {
        if (attempt < delays.length && isTransient(e)) return sleep(delays[attempt++]).then(go);
        throw e;
      });
    }
    return go();
  }

  function wikipediaQueryUrl(lang, lat, lon, radius, cfg) {
    var w = cfg.wikipedia;
    return 'https://' + lang + '.wikipedia.org/w/api.php?' + qs({
      action: 'query', format: 'json', formatversion: 2, origin: '*',
      generator: 'geosearch', ggscoord: lat + '|' + lon,
      ggsradius: Math.min(10000, Math.max(10, Math.round(radius))),
      ggslimit: Math.min(500, w.limit || 500),
      prop: 'coordinates|pageprops|info',
      colimit: 'max', ppprop: 'wikibase_item'
    });
  }

  /** Loads geotagged articles around a point for one language, following "continue". */
  function loadWikipedia(lang, lat, lon, radius, cfg, f, retryDelays) {
    var base = wikipediaQueryUrl(lang, lat, lon, radius, cfg);
    var pages = {}, rounds = 0, requests = 0;
    function step(cont) {
      var url = base + (cont ? '&' + qs(cont) : '');
      requests++;
      return getJsonRetry(url, f, retryDelays).then(function (data) {
        var list = (data.query && data.query.pages) || [];
        if (!Array.isArray(list)) list = Object.keys(list).map(function (k) { return list[k]; });
        list.forEach(function (pg) {
          if (pg.missing || (pg.ns != null && pg.ns !== 0)) return;
          var cur = pages[pg.pageid] || (pages[pg.pageid] = { lang: lang, pageid: pg.pageid, title: pg.title });
          if (pg.coordinates && pg.coordinates[0]) { cur.lat = pg.coordinates[0].lat; cur.lon = pg.coordinates[0].lon; }
          if (pg.pageprops && pg.pageprops.wikibase_item) cur.wikidata = pg.pageprops.wikibase_item;
          if (typeof pg.length === 'number') cur.length = pg.length;
        });
        rounds++;
        if (data.continue && rounds < 10) return step(data.continue);
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
  function langValues(obj) {
    var o = {};
    Object.keys(obj || {}).forEach(function (l) { if (obj[l] && obj[l].value) o[l] = obj[l].value; });
    return o;
  }

  function compactEntity(e, cfg, langs) {
    var claims = e.claims || {};
    var p1435 = claimIds(claims, 'P1435');
    var unescoQ = cfg.score.unesco_qids || [];
    return {
      s: sitelinkCount(e.sitelinks),
      p31: claimIds(claims, 'P31'),
      h: p1435,
      u: !!(claims.P757 && claims.P757.length) || p1435.some(function (q) { return unescoQ.indexOf(q) >= 0; }),
      lab: langValues(e.labels),     // names per language
      desc: langValues(e.descriptions),
      l: langs.join('|'),            // languages requested (cache is valid for these)
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

  // Generic batched wbgetentities loader with cache {get,set}; cache keys get a prefix.
  // o: {ids, props, langs, prefix, toInfo(e), valid(cached), missingInfo(), f, cache, onProgress, retryDelays}
  function loadEntities(o) {
    var out = {}, need = [], now = Date.now();
    o.ids.forEach(function (id) {
      var c = o.cache && o.cache.get(o.prefix + id);
      if (c && now - (c.t || 0) < WD_TTL && (!o.valid || o.valid(c))) out[id] = c; else need.push(id);
    });
    var batches = [];
    for (var i = 0; i < need.length; i += 50) batches.push(need.slice(i, i + 50));
    var done = 0, failed = 0;
    return runLimited(batches, 4, function (batch) {
      var url = 'https://www.wikidata.org/w/api.php?' + qs({
        action: 'wbgetentities', format: 'json', origin: '*',
        ids: batch.join('|'), props: o.props, languages: o.langs.join('|')
      });
      return getJsonRetry(url, o.f, o.retryDelays).then(function (data) {
        var ents = data.entities || {};
        Object.keys(ents).forEach(function (k) {
          var e = ents[k];
          if (!e || e.missing !== undefined) {
            // remember missing ids too (if wanted), so they are not requested on every search
            if (o.missingInfo && o.cache) o.cache.set(o.prefix + k, o.missingInfo());
            return;
          }
          var info = o.toInfo(e);
          out[k] = info;
          if (e.id && e.id !== k) out[e.id] = info; // redirects
          if (o.cache) o.cache.set(o.prefix + k, info);
        });
      }, function () { failed++; }).then(function () {
        done++;
        if (o.onProgress) o.onProgress(done, batches.length);
      });
    }).then(function () {
      return { info: out, requests: batches.length, cached: o.ids.length - need.length, failedBatches: failed };
    });
  }

  /** Wikidata info for items (sitelinks, P31, heritage, labels, descriptions) in de, en and the local language. */
  function loadWikidata(ids, cfg, f, cache, onProgress, retryDelays, langs) {
    langs = langs || ['de', 'en'];
    return loadEntities({
      ids: ids, props: 'sitelinks|claims|descriptions|labels', langs: langs, prefix: '',
      toInfo: function (e) { return compactEntity(e, cfg, langs); },
      valid: function (c) {
        var have = String(c.l || '').split('|');
        return !!c.lab && langs.every(function (l) { return have.indexOf(l) >= 0; });
      },
      f: f, cache: cache, onProgress: onProgress, retryDelays: retryDelays
    });
  }

  /** Labels of Wikidata classes (P31 values), e.g. Q7075 -> {en: "library", de: "Bibliothek"}. */
  function loadClassLabels(ids, f, cache, retryDelays) {
    return loadEntities({
      ids: ids, props: 'labels', langs: ['de', 'en'], prefix: 'cls:',
      toInfo: function (e) {
        var l = e.labels || {};
        return { en: l.en ? l.en.value : '', de: l.de ? l.de.value : '', t: Date.now() };
      },
      missingInfo: function () { return { en: '', de: '', t: Date.now() }; },
      f: f, cache: cache, retryDelays: retryDelays
    });
  }

  // ------------------------------------------------------------- places

  /**
   * Builds unified place objects (format of PROJEKT.md 5b plus internal fields).
   * langResults: [{lang, pages:[...]}, ...] in preference order (first = display language).
   */
  /**
   * Display names: local name first if written in Latin letters, otherwise English;
   * German name as second line if different. Returns {name, name2}.
   */
  function pickNames(n) {
    var first;
    if (n.local && isLatin(n.local)) first = n.local;                       // e.g. "Hôtel de ville de Morges"
    else if (n.local) first = (isLatin(n.en) && n.en) || n.de || n.local;   // e.g. Japanese: English first
    else first = n.de || n.en || '';                                        // local name unknown: German

    // German only as a second line if it really is another name (v0.5: not just a variant with "de la" etc.)
    var second = n.de && !sameName(n.de, first) ? n.de : '';
    return { name: first, name2: second };
  }

  /**
   * True if two names are the same apart from small words, accents and punctuation, or one only
   * adds words to the other: "Espace Horloger Vallée de Joux" = "Espace Horloger de la Vallée de Joux".
   * "Château de Morges" ≠ "Schloss Morges", "Manchester Cathedral" ≠ "Kathedrale von Manchester".
   */
  function sameName(a, b) {
    var wa = normName(a).split(' ').filter(Boolean), wb = normName(b).split(' ').filter(Boolean);
    if (!wa.length || !wb.length) return String(a || '').toLowerCase() === String(b || '').toLowerCase();
    var inB = wa.every(function (w) { return wb.indexOf(w) >= 0; });
    var inA = wb.every(function (w) { return wa.indexOf(w) >= 0; });
    return inA || inB;
  }

  function buildPlaces(langResults, wd, classes, cfg, center, localLang) {
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
    classes = classes || {};

    return order.map(function (key) {
      var g = groups[key];
      var info = g.wikidata ? wd[g.wikidata] : null;
      var artikel = {}, titles = [], longest = null, lat = null, lon = null;
      langs.forEach(function (l) {
        var pg = g.pages[l];
        if (!pg) return;
        artikel[l] = pg.title;
        titles.push(pg.title);
        if (!longest || (pg.length || 0) > (longest.length || 0)) longest = pg;
        if (lat == null) { lat = pg.lat; lon = pg.lon; }
      });
      var lab = (info && info.lab) || {}, dsc = (info && info.desc) || {};
      var names = {
        de: cleanTitle(artikel.de || lab.de || ''),
        en: cleanTitle(artikel.en || lab.en || ''),
        local: localLang ? cleanTitle(artikel[localLang] || lab[localLang] || '') : ''
      };
      if (!names.de && !names.en && !names.local) names.local = cleanTitle(titles[0]);
      var nm = pickNames(names);
      var p31 = info ? info.p31 : [];
      var classLabels = [];
      p31.forEach(function (q) { var c = classes[q]; if (c) { classLabels.push(c.en, c.de); } });
      var descs = [dsc.en, dsc.de].concat(localLang && localLang !== 'en' && localLang !== 'de' ? [dsc[localLang]] : []);
      var typ = classify(p31, classLabels, descs, titles, cfg);
      var t = typeInfo(typ, cfg);
      var p = {
        id: key,
        name: nm.name,
        name2: nm.name2,
        namen: names,
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
        beschreibung: dsc.de || dsc.en || (localLang ? dsc[localLang] : '') || '',
        klassen: classLabels.filter(Boolean).filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 4),
        sprachversionen: info ? info.s : Object.keys(artikel).length,
        laenge: longest ? (longest.length || 0) : 0,
        denkmal: info ? info.h : [],
        unesco: info ? info.u : false,
        ort: ''
      };
      var sc = computeScore(p, cfg);
      p.score = sc.score;
      p.teile = sc.teile;
      p.sterne = starsFor(p.score, typ, cfg);
      p.dauer_min = (cfg.dauer_min && cfg.dauer_min[String(p.sterne)]) || 0;
      p.dist = center ? Math.round(haversine(center.lat, center.lon, p.lat, p.lon)) : null;
      return p;
    });
  }

  /** Where places come from: only Wikipedia, only OpenStreetMap, both. */
  function sourceCounts(places) {
    var c = { w: 0, o: 0, wo: 0 };
    places.forEach(function (p) {
      var q = p.quellen || [], w = q.indexOf('W') >= 0, o = q.indexOf('O') >= 0;
      if (w && o) c.wo++; else if (o) c.o++; else c.w++;
    });
    return c;
  }
  /** Short source tag for the list: "W", "OSM", "W+OSM". */
  function sourceTag(p) {
    var q = p.quellen || [], w = q.indexOf('W') >= 0, o = q.indexOf('O') >= 0;
    return w && o ? 'W+OSM' : o ? 'OSM' : 'W';
  }

  function sortPlaces(list) {
    return list.sort(function (a, b) {
      return (b.sterne - a.sterne) || (b.score - a.score) || ((a.dist || 0) - (b.dist || 0));
    });
  }

  /** Main local language of a place (from Nominatim country/region), e.g. "fr" for Morges, "en" for Manchester. */
  function localLanguage(placeInfo, cfg) {
    var map = cfg.landessprachen || {};
    var cc = placeInfo && placeInfo.cc, region = placeInfo && placeInfo.region;
    var v = (region && map[region]) || (cc && map[cc]) || null;
    return Array.isArray(v) ? v[0] : v;
  }

  /** Wikipedia languages for a place: configured ones plus the local language(s). */
  function languagesFor(placeInfo, cfg) {
    var langs = (cfg.wikipedia.sprachen || ['de', 'en']).slice();
    var map = cfg.landessprachen || {};
    var cc = placeInfo && placeInfo.cc, region = placeInfo && placeInfo.region;
    var extra = (region && map[region]) || (cc && map[cc]) || [];
    if (typeof extra === 'string') extra = [extra];
    extra.forEach(function (l) { if (langs.indexOf(l) < 0) langs.push(l); });
    return langs;
  }

  // ---------------------------------------------------- areas (v0.5/v0.6)

  /** Map section {south, west, north, east} -> width/height in metres. */
  function bboxSize(b) {
    var midLat = (b.south + b.north) / 2;
    return {
      w: haversine(midLat, b.west, midLat, b.east),
      h: haversine(b.south, b.west, b.north, b.west)
    };
  }
  function bboxCenter(b) { return { lat: (b.south + b.north) / 2, lon: (b.west + b.east) / 2 }; }
  /** Smallest circle around the map section (centre and half diagonal). */
  function circleFor(b) {
    var c = bboxCenter(b);
    return { lat: c.lat, lon: c.lon, radius: Math.ceil(haversine(c.lat, c.lon, b.north, b.east)) };
  }
  function inBbox(p, b) { return p.lat >= b.south && p.lat <= b.north && p.lon >= b.west && p.lon <= b.east; }
  function bboxContains(outer, inner) {
    return inner.south >= outer.south && inner.north <= outer.north && inner.west >= outer.west && inner.east <= outer.east;
  }
  function bboxOverlaps(a, b) { return a.south < b.north && a.north > b.south && a.west < b.east && a.east > b.west; }
  /** Splits a map section into square cells of about `side` metres; returns the covering circles. */
  function cellsFor(b, side) {
    var s = bboxSize(b);
    var ny = Math.max(1, Math.ceil(s.h / side)), nx = Math.max(1, Math.ceil(s.w / side));
    var dLat = (b.north - b.south) / ny, dLon = (b.east - b.west) / nx, out = [];
    for (var y = 0; y < ny; y++) {
      for (var x = 0; x < nx; x++) {
        out.push(circleFor({ south: b.south + y * dLat, north: b.south + (y + 1) * dLat, west: b.west + x * dLon, east: b.west + (x + 1) * dLon }));
      }
    }
    return out;
  }
  function insideAny(circles, lat, lon) {
    return circles.some(function (c) { return haversine(c.lat, c.lon, lat, lon) <= c.radius; });
  }

  /**
   * Wikipedia for one language and several circles. Wikipedia gives at most 500 articles per query:
   * a full circle is split into four smaller ones (twice at most), so dense city centres are complete.
   */
  function loadWikipediaArea(lang, circles, cfg, f, retryDelays, onCell) {
    var limit = Math.min(500, cfg.wikipedia.limit || 500);
    var pages = {}, requests = 0, done = 0;
    function one(c, depth) {
      return loadWikipedia(lang, c.lat, c.lon, c.radius, cfg, f, retryDelays).then(function (r) {
        requests += r.requests;
        r.pages.forEach(function (pg) {
          var cur = pages[pg.pageid];
          if (!cur) pages[pg.pageid] = pg;
          else if ((pg.length || 0) > (cur.length || 0)) cur.length = pg.length;
        });
        if (r.pages.length >= limit && depth < 2 && c.radius > 300) {
          var dLat = c.radius / 2 / 111320, dLon = c.radius / 2 / (111320 * Math.max(0.2, Math.cos(c.lat * Math.PI / 180)));
          var subs = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(function (d) {
            return { lat: c.lat + d[0] * dLat, lon: c.lon + d[1] * dLon, radius: Math.ceil(c.radius * 0.71) };
          });
          return runLimited(subs, 2, function (sc) { return one(sc, depth + 1); });
        }
      });
    }
    return runLimited(circles, 2, function (c) {
      return one(c, 0).then(function () { done++; if (onCell) onCell(done, circles.length); });
    }).then(function () {
      return { lang: lang, requests: requests, pages: Object.keys(pages).map(function (k) { return pages[k]; }) };
    });
  }

  /**
   * Full pipeline: Wikipedia (all languages) -> Wikidata items -> class labels -> places, plus OpenStreetMap.
   * opts: {lat, lon, radius | circles, bbox (only places inside), cfg, fetch, wdCache, osmCache, osm, langs, localLang,
   *        onProgress(text, phase), retryDelays, control (gets control.skipOsm()), osmWaitS, onOsmLate(info)}
   * phase: 'wiki' (Wikipedia loading), 'osm' (only OpenStreetMap missing), 'wd' (Wikidata).
   */
  function loadPlaces(opts) {
    var cfg = opts.cfg, f = opts.fetch, prog = opts.onProgress || function () {};
    var langs = opts.langs || cfg.wikipedia.sprachen || ['de', 'en'];
    var useOsm = !!(cfg.osm && cfg.osm.aktiv !== false && opts.osm !== false);
    var circles = opts.circles || [{ lat: opts.lat, lon: opts.lon, radius: opts.radius }];
    var centre = opts.lat != null ? { lat: opts.lat, lon: opts.lon } : opts.bbox ? bboxCenter(opts.bbox) : circles[0];
    var t0 = Date.now(), warnings = [], requests = 0;
    // v0.9.3: OSM only for small sections (max_kacheln tiles) – a big one took minutes and its OSM points are hardly shown
    var osmMax = cfg.osm && cfg.osm.max_kacheln, osmBig = false;
    // v0.11.0: tiles from prepared files do not count (they come in seconds)
    if (useOsm && osmMax && osmTileKeys(circles, cfg, opts.bbox).filter(function (k) { return !osmFile(k); }).length > osmMax) { useOsm = false; osmBig = true; }
    var src = { wiki: { ms: null }, osm: { state: osmBig ? 'gross' : useOsm ? 'wait' : 'off', ms: null } };
    var many = circles.length > 1;
    prog('Lade Wikipedia (' + langs.join(', ') + ')' + (useOsm ? ' und OSM' : '') + ' …', 'wiki');
    // OpenStreetMap: wait at most osmWaitS (or until the user taps "Ohne OSM weiter"), then go on without it.
    // Loading continues in the background and fills the cache; onOsmLate reports when it is done.
    var osmDecided = false, skipFn = null;
    var skipP = new Promise(function (res) { skipFn = res; });
    if (opts.control) opts.control.skipOsm = function () { skipFn('skip'); };
    var waitS = opts.osmWaitS || (cfg.osm && cfg.osm.max_wartezeit_s) || 120;
    var osmFull = useOsm ? loadOsmArea(circles, cfg, f, opts.osmCache, null, !!opts.osmCacheOnly, opts.bbox) : null;
    var waitTimer = null;
    var waitP = useOsm ? new Promise(function (res) { waitTimer = setTimeout(function () { res('timeout'); }, waitS * 1000); }) : null;
    var osmP = !useOsm ? Promise.resolve(null) : Promise.race([
      osmFull.then(function (r) {
        if (!osmDecided) { src.osm.state = r.missingTiles ? 'prep' : r.requests ? 'ok' : 'cache'; src.osm.ms = Date.now() - t0; src.osm.tiles = r.tiles; src.osm.cachedTiles = r.cachedTiles; src.osm.server = r.servers.join(', '); src.osm.els = r.els.length; }
        return r;
      }, function (e) {
        if (!osmDecided) { src.osm.state = 'error'; src.osm.ms = Date.now() - t0; src.osm.error = e.message; warnings.push('OpenStreetMap: ' + e.message); }
        return null;
      }),
      waitP,
      skipP
    ]).then(function (r) {
      osmDecided = true;
      clearTimeout(waitTimer);
      if (r === 'timeout' || r === 'skip') {
        src.osm.state = r; src.osm.ms = Date.now() - t0;
        if (r === 'timeout') warnings.push('OpenStreetMap: keine Antwort nach ' + waitS + ' s – Orte ohne OSM.');
        osmFull.then(function (full) {
          if (opts.onOsmLate) opts.onOsmLate({ ok: true, ms: Date.now() - t0, els: full.els.length });
        }, function (e) {
          if (opts.onOsmLate) opts.onOsmLate({ ok: false, ms: Date.now() - t0, error: e.message });
        });
        return null;
      }
      return r;
    });
    var wikiP = Promise.all(langs.map(function (l) {
      return loadWikipediaArea(l, circles, cfg, f, opts.retryDelays, many ? function (d, n) {
        prog('Lade Wikipedia ' + l + ': Bereich ' + d + '/' + n + ' …', 'wiki');
      } : null).catch(function (e) {
        warnings.push('Wikipedia ' + l + ': ' + e.message);
        return null;
      });
    })).then(function (r) {
      src.wiki.ms = Date.now() - t0;
      if (useOsm && !osmDecided) prog('Warte auf OSM …', 'osm');
      return r;
    });
    return Promise.all([wikiP, osmP]).then(function (both) {
      var lrs = both[0], osm = both[1];
      var ok = lrs.filter(Boolean);
      if (!ok.length && !(osm && osm.els.length)) throw new Error('Wikipedia nicht erreichbar (' + warnings.join('; ') + ')');
      requests += ok.reduce(function (s, lr) { return s + lr.requests; }, 0) + (osm ? osm.requests : 0);
      if (osm && osm.failedTiles) warnings.push('OpenStreetMap: ' + osm.failedTiles + ' von ' + osm.tiles + ' Kacheln fehlgeschlagen');
      var ids = {};
      ok.forEach(function (lr) { lr.pages.forEach(function (pg) { if (pg.wikidata) ids[pg.wikidata] = 1; }); });
      if (osm) osm.els.forEach(function (e) { if (e.wd) ids[e.wd] = 1; });
      var idList = Object.keys(ids);
      prog('Lade Wikidata (' + idList.length + ' Einträge) …', 'wd');
      var labelLangs = ['de', 'en'];
      if (opts.localLang && labelLangs.indexOf(opts.localLang) < 0) labelLangs.push(opts.localLang);
      return loadWikidata(idList, cfg, f, opts.wdCache, function (d, n) {
        prog('Lade Wikidata ' + d + '/' + n + ' …', 'wd');
      }, opts.retryDelays, labelLangs).then(function (wdr) {
        requests += wdr.requests;
        if (wdr.failedBatches) warnings.push('Wikidata: ' + wdr.failedBatches + ' Abfrage(n) fehlgeschlagen');
        var cls = {};
        Object.keys(wdr.info).forEach(function (k) { (wdr.info[k].p31 || []).forEach(function (q) { cls[q] = 1; }); });
        prog('Lade Wikidata-Klassen …', 'wd');
        return loadClassLabels(Object.keys(cls), f, opts.wdCache, opts.retryDelays).then(function (cr) {
          requests += cr.requests;
          if (cr.failedBatches) warnings.push('Wikidata-Klassen: ' + cr.failedBatches + ' Abfrage(n) fehlgeschlagen');
          var places = buildPlaces(ok, wdr.info, cr.info, cfg, centre, opts.localLang || null);
          var mstats = null;
          if (osm) {
            var m = mergeOsm(places, osm.els, wdr.info, cr.info, cfg, centre, opts.localLang || null);
            places = m.places; mstats = m.stats;
          }
          if (opts.bbox) places = places.filter(function (p) { return inBbox(p, opts.bbox); });
          src.osm.neu = places.filter(function (p) { return p.quellen.join() === 'O'; }).length;
          return {
            places: sortPlaces(places),
            warnings: warnings,
            stats: {
              ms: Date.now() - t0,
              langs: langs.join(','),
              perLang: ok.map(function (lr) { return lr.lang + ':' + lr.pages.length; }).join(' ') + (osm ? ' osm:' + osm.els.length : ''),
              requests: requests,
              wdCached: wdr.cached,
              wdTotal: idList.length,
              osm: mstats,
              osmTiles: osm ? osm.tiles : 0,
              src: src,
              herkunft: sourceCounts(places)
            }
          };
        });
      });
    });
  }

  /** Place name, country and region via Nominatim reverse geocoding (one request per search). */
  function reverseGeocode(lat, lon, f) {
    var url = 'https://nominatim.openstreetmap.org/reverse?' + qs({
      lat: lat.toFixed(4), lon: lon.toFixed(4), format: 'jsonv2', zoom: 10, 'accept-language': 'de'
    });
    return getJson(url, f).then(function (d) {
      var a = (d && d.address) || {};
      return {
        name: a.city || a.town || a.village || a.municipality || a.county || a.state || (d && d.name) || '',
        cc: (a.country_code || '').toLowerCase(),
        state: a.state || '',
        region: a['ISO3166-2-lvl4'] || ''
      };
    });
  }

  var NOMINATIM_TYPES = {
    city: 'Stadt', town: 'Stadt', village: 'Dorf', hamlet: 'Weiler', suburb: 'Stadtteil', quarter: 'Viertel',
    neighbourhood: 'Viertel', city_district: 'Stadtbezirk', borough: 'Bezirk', municipality: 'Gemeinde',
    county: 'Bezirk/Kreis', state_district: 'Bezirk', state: 'Region', region: 'Region', country: 'Land',
    administrative: 'Verwaltungsgebiet', island: 'Insel', museum: 'Museum', gallery: 'Galerie',
    attraction: 'Sehenswürdigkeit', viewpoint: 'Aussichtspunkt', artwork: 'Kunstwerk', castle: 'Burg/Schloss',
    monument: 'Denkmal', memorial: 'Denkmal', ruins: 'Ruine', archaeological_site: 'Ausgrabung',
    place_of_worship: 'Kirche/Gotteshaus', church: 'Kirche', cathedral: 'Kathedrale', theatre: 'Theater',
    library: 'Bibliothek', park: 'Park', garden: 'Garten', zoo: 'Zoo', station: 'Bahnhof', square: 'Platz',
    road: 'Straße', building: 'Gebäude', peak: 'Gipfel', lake: 'See', water: 'Gewässer'
  };
  var SETTLEMENT = ['city', 'town', 'village', 'hamlet', 'suburb', 'quarter', 'neighbourhood', 'city_district',
    'borough', 'municipality', 'county', 'state_district', 'state', 'region', 'country', 'administrative', 'island'];

  /**
   * Search a place or sight by name (Nominatim, only on explicit user action, no autocomplete).
   * view: optional {west, south, east, north} of the current map; nearby results are preferred.
   * Duplicates (same name within 25 km) are merged.
   */
  function searchPlaces(q, f, view) {
    var params = { q: q, format: 'jsonv2', limit: 10, 'accept-language': 'de' };
    if (view) { params.viewbox = [view.west, view.north, view.east, view.south].map(function (x) { return x.toFixed(4); }).join(','); params.bounded = 0; }
    var url = 'https://nominatim.openstreetmap.org/search?' + qs(params);
    return getJson(url, f).then(function (list) {
      var out = [];
      (list || []).forEach(function (r) {
        var lat = parseFloat(r.lat), lon = parseFloat(r.lon);
        if (isNaN(lat) || isNaN(lon)) return;
        var parts = String(r.display_name || '').split(', ');
        var name = r.name || parts[0] || q;
        var kind = r.addresstype || r.type || '';
        var dup = out.some(function (o) {
          return o.name.toLowerCase() === name.toLowerCase() && haversine(o.lat, o.lon, lat, lon) < 25000;
        });
        if (dup) return;
        out.push({
          name: name,
          detail: parts.slice(1).filter(function (x, i, a) { return !/^\d{4,6}$/.test(x) && (i < 3 || i === a.length - 1); }).join(', '),
          typ: NOMINATIM_TYPES[kind] || NOMINATIM_TYPES[r.type] || '',
          poi: SETTLEMENT.indexOf(kind) < 0 && r.category !== 'boundary' && r.category !== 'place',
          lat: lat, lon: lon
        });
      });
      return out.slice(0, 6);
    });
  }

  // -------------------------------------------------------- short texts

  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /** Short map label: without the city name, at most `max` characters, cut at a word boundary. */
  function shortLabel(name, ort, max) {
    max = max || 18;
    var s = String(name || '').trim();
    if (ort) {
      var t = s.replace(new RegExp('(^|[\\s,–-]+)' + escRe(ort) + '(?=$|[\\s,–-])', 'gi'), ' ')
        .replace(/\s+/g, ' ').replace(/^[\s,–-]+|[\s,–-]+$/g, '')
        .replace(/\s+(von|vom|de|du|des|d'|of|di|del|della|la|le)$/i, '').trim();
      // only drop the city if a complete name is left: "Old Trafford" stays, "Manchester Cathedral" -> "Cathedral"
      if (t.split(' ').length >= 2 || t.length >= 8) s = t;
    }
    if (s.length <= max) return s;
    var cut = s.slice(0, max);
    var sp = cut.lastIndexOf(' ');
    if (sp >= 8) cut = cut.slice(0, sp);
    return cut.replace(/[\s,–-]+$/, '') + '…';
  }

  // v0.9.3: "Deutsches Medizinhistorisches Museum" -> "Medizinhistorisches Museum" on the map, but only if a real name
  // is left: "Deutsches Museum", "Deutsches Eck" stay. A single word is enough when it is a compound of a type word
  // ("Bayerisches Armeemuseum" -> "Armeemuseum").
  var NAT_PREFIX = /^(?:Deutsche[srn]?|Bayerische[srn]?)\s+(.+)$/;
  var TYPE_TAIL = /(museum|kirche|theater|oper|bibliothek|archiv|schloss|burg|garten|park|haus|halle|zentrum|denkmal|galerie|sammlung)$/i;
  function dropNationalPrefix(name) {
    var m = NAT_PREFIX.exec(String(name || '').trim());
    if (!m) return name;
    var rest = m[1].trim(), words = rest.split(/\s+/);
    if (words.length >= 2) return rest;
    var t = TYPE_TAIL.exec(rest);
    return t && rest.length > t[1].length + 2 ? rest : name;
  }

  // v0.9.4: names from Wikidata/Wikipedia that are really descriptions ("Bodendenkmal in Geisenfeld, #D-1-7336-0006",
  // "Pfarrhof, um einen geschlossenen Hof geordnete Anlage"): monument numbers never, the clause after the comma only
  // when it starts in lower case (a description, not part of the name) or the name is very long.
  function displayName(name) {
    var raw = String(name || '').trim();
    var s = raw.replace(/\s*[,;(–-]*\s*#\s*[\w-]*\d[\w-]*\)?/g, '').replace(/\s*[,;(]*\s*\b[A-Z]-\d-\d{3,}(?:-\d+)*\)?/g, '')
      .replace(/^(Bodendenkmal|Baudenkmal)\s+in\s+/i, '$1 ').replace(/\s+/g, ' ').replace(/[\s,;–-]+$/, '').trim();
    var i = s.indexOf(',');
    if (i > 0) {
      var head = s.slice(0, i).trim(), tail = s.slice(i + 1).trim();
      if (head.length >= 5 && (/^[a-zäöüß]/.test(tail) || (s.length > 45 && head.length >= 10))) s = head;
    }
    return s || raw;
  }
  /** A name that is a description (monument lists): such a sight only counts from the closest zoom. */
  function isDescriptiveName(name) {
    var n = String(name || '').trim();
    return displayName(n) !== n || /^(Bodendenkmal|Baudenkmal)\b/i.test(n);
  }

  /**
   * Label of a map point in up to `lines` lines of about `max` characters (v0.9.3, before: one line, 18 characters).
   * Without the town ("Manchester Cathedral" -> "Cathedral", see shortLabel), without a bracket at the end
   * ("St. Matthäus (Ingolstadt)") and without "Deutsches"/"Bayerisches" in front where a name is left.
   */
  function mapLabel(name, ort, max, lines) {
    max = max || 16; lines = lines || 2;
    var s = shortLabel(displayName(name), ort, 1000).replace(/\s*\([^()]*\)\s*$/, '').trim() || String(name || '').trim();
    s = dropNationalPrefix(s);
    var words = s.split(/\s+/).filter(Boolean), out = [], cur = '';
    var longWord = max + 6; // long German compounds stay whole
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!cur) cur = w;
      else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
      else { out.push(cur); cur = w; }
      if (out.length === lines) { cur = ''; break; }
    }
    if (cur) out.push(cur);
    var cutAll = out.length > lines || words.join(' ').length > out.slice(0, lines).join(' ').length;
    out = out.slice(0, lines).map(function (l) {
      return l.length > longWord ? l.slice(0, longWord).replace(/[\s,–-]+$/, '') + '…' : l;
    });
    if (cutAll && !/…$/.test(out[out.length - 1])) out[out.length - 1] = out[out.length - 1].replace(/[\s,–-]+$/, '') + '…';
    return out;
  }

  /** Wikidata description without the location part: "Museum in Morges (Schweiz)" -> "Museum". */
  function stripLocation(desc) {
    var s = String(desc || '').split(/[,;]/)[0];
    s = s.replace(/\s+(?:(?:based|located|situated|situé|située|situato|situata|gelegen)\s+)?(in|im|in der|in den|bei|nahe|near|at|in the|à|au|aux|en|a|nel|nella)\s+[A-ZÄÖÜÉÈ].*$/, '')
      .replace(/\s+(based|located|situated|situé|située|gelegen)$/i, '').trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  var ABBR = /(?:\b(?:St|Dr|Nr|ca|bzw|vgl|z|B|u|a|d|h|e|g|i|Mr|Mrs|Jr|Sr|No|Mt|Ste|Sta|S|v|Chr|Jh|Jhd)|\b[A-Z])$/;

  // v0.9.3/v0.10.0: "am 18. Oktober", "im 19. Jahrhundert": a short number with a dot is an ordinal, not the end
  function ordinalEnd(s, i) { return s[i] === '.' && /(^|[^\d.])\d{1,2}$/.test(s.slice(0, i)); }

  /** First sentence of an extract, without bracketed asides and reference marks, at most ~220 chars. */
  function firstSentence(text, max) {
    max = max || 220;
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    for (var k = 0; k < 3; k++) s = s.replace(/\s*\([^()]*\)/g, '').replace(/\s*\[[^\[\]]*\]/g, '');
    s = s.replace(/\s+([,.;:])/g, '$1');
    var re = /[.!?](?=\s+["„«(]?[A-ZÄÖÜÉÈÀ0-9])/g, m;
    while ((m = re.exec(s))) {
      var head = s.slice(0, m.index);
      if (ordinalEnd(s, m.index)) continue;
      if (!ABBR.test(head)) { s = s.slice(0, m.index + 1); break; }
    }
    if (s.length > max) {
      var cut = s.slice(0, max), sp = cut.lastIndexOf(' ');
      s = (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–-]+$/, '') + ' …';
    }
    return s;
  }

  // Location phrase at the end of a sentence: " in Manchester, England", " based in …", " situé à Morges", ", en Suisse"
  var LOC_TAIL = new RegExp('\\s*,?\\s+(?:(?:based|located|situated|sited|situé|située|situato|situata|ubicado|gelegen)\\s+)?' +
    '(?:in|im|at|near|bei|à|en|nahe|nel|nella)\\s+(?:the\\s+|der\\s+|dem\\s+|den\\s+|la\\s+|le\\s+|l\')?' +
    '(?:(?:city|town|centre|center|Stadt|Innenstadt|Zentrum|Stadtzentrum|village|Dorf|Gemeinde|ville|commune)\\s+(?:of|von|de)\\s+)?' +
    '[A-ZÄÖÜÉÈÀ][\\p{L}\'’.\\-]*(?:\\s+[A-ZÄÖÜÉÈÀ][\\p{L}\'’.\\-]*)*' +
    '(?:\\s*,\\s*(?:in\\s+|en\\s+)?[A-ZÄÖÜÉÈÀ][\\p{L}\'’.\\-]*(?:\\s+[A-ZÄÖÜÉÈÀ][\\p{L}\'’.\\-]*)*)*(?:\\s*\\([^)]*\\))?(?=[.!?]$)', 'u');

  /** Removes the location at the end of a sentence ("… ein Kunstmuseum in Manchester." -> "… ein Kunstmuseum."). */
  // A sentence that only says where something is would be broken without the place ("Es befindet sich.")
  var DANGLING = /\b(befindet sich|befinden sich|liegt|liegen|steht|stehen|gelegen|ansässig|is located|are located|is situated|is sited|lies|stands|is based|se trouve|se situe|est situé|est située|est implanté|si trova|è situato|è situata|se encuentra|está situado|está situada|is|are|was|were|ist|sind|war|waren|est|sont|était|è|sono|es|está)\s*[.!?]?$/i;

  function dropLocation(sentence) {
    var s = String(sentence || '').trim();
    for (var i = 0; i < 3; i++) {
      var t = s.replace(LOC_TAIL, '').replace(/[\s,;]+([.!?])$/, '$1');
      if (t === s) break;
      // keep the sentence as it is rather than leaving a broken one (user decision v0.3.2)
      if (DANGLING.test(t) || t.split(/\s+/).length < 4) break;
      s = t;
    }
    return s;
  }

  function splitSentences(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    for (var k = 0; k < 3; k++) s = s.replace(/\s*\([^()]*\)/g, '').replace(/\s*\[[^\[\]]*\]/g, '');
    s = s.replace(/\s+([,.;:])/g, '$1');
    var out = [], re = /[.!?](?=\s+["„«(]?[A-ZÄÖÜÉÈÀ0-9])/g, m, start = 0;
    while ((m = re.exec(s))) {
      var head = s.slice(0, m.index);
      if (ABBR.test(head) || ordinalEnd(s, m.index)) continue; // v0.10.0: "am 23. Juni" also here
      out.push(s.slice(start, m.index + 1).trim());
      start = m.index + 1;
    }
    if (start < s.length) out.push(s.slice(start).trim());
    return out.filter(Boolean);
  }

  /**
   * "What is it?" text: first sentence without the location; if that is short, the second sentence too
   * (it usually says what kind of art, collection etc.). At most ~max characters.
   */
  function shortInfo(text, max) {
    max = max || 260;
    var ss = splitSentences(text).map(dropLocation);
    var s = ss[0] || '';
    if (s.length < 90 && ss[1]) s += ' ' + ss[1];
    if (s.length > max) {
      var cut = s.slice(0, max), sp = cut.lastIndexOf(' ');
      s = (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–-]+$/, '') + ' …';
    }
    return s;
  }

  /** Article to read for a place: German if available, else English, else the longest one. */
  function articleFor(p, prefer) {
    var a = p.artikel || {};
    var order = prefer || ['de', 'en'];
    for (var i = 0; i < order.length; i++) if (a[order[i]]) return { lang: order[i], title: a[order[i]] };
    var w = String(p.wikipedia || '');
    var ix = w.indexOf(':');
    return ix > 0 ? { lang: w.slice(0, ix), title: w.slice(ix + 1) } : null;
  }

  /**
   * Loads the first sentence of the Wikipedia intro for several places (max 20 per request and language).
   * Returns {id: {lang, text}}.
   */
  function loadIntros(places, f, retryDelays) {
    var byLang = {};
    places.forEach(function (p) {
      var a = articleFor(p);
      if (!a) return;
      (byLang[a.lang] = byLang[a.lang] || []).push({ id: p.id, title: a.title });
    });
    var jobs = [];
    Object.keys(byLang).forEach(function (lang) {
      var items = byLang[lang];
      for (var i = 0; i < items.length; i += 20) jobs.push({ lang: lang, items: items.slice(i, i + 20) });
    });
    var out = {};
    return runLimited(jobs, 2, function (job) {
      var url = 'https://' + job.lang + '.wikipedia.org/w/api.php?' + qs({
        action: 'query', format: 'json', formatversion: 2, origin: '*', redirects: 1,
        prop: 'extracts', exintro: 1, explaintext: 1, exlimit: 20, // v0.10.0: no exsentences – Wikipedia ended at "am 23."
        titles: job.items.map(function (x) { return x.title; }).join('|')
      });
      return getJsonRetry(url, f, retryDelays).then(function (d) {
        var q = d.query || {}, map = {};
        (q.normalized || []).concat(q.redirects || []).forEach(function (n) { map[n.from] = n.to; });
        var byTitle = {};
        (q.pages || []).forEach(function (pg) { if (pg.extract) byTitle[pg.title] = pg.extract; });
        job.items.forEach(function (it) {
          var t = it.title, guard = 0;
          while (map[t] && guard++ < 3) t = map[t];
          var ex = byTitle[t];
          if (ex) out[it.id] = { lang: job.lang, text: shortInfo(ex) };
        });
      }, function () { /* leave missing */ });
    }).then(function () { return out; });
  }

  // ---------------------------------------------------------- translation

  function decodeEntities(s) {
    return String(s || '').replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); })
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  var chromeTranslators = {};
  // Chrome's built-in on-device translator (Translator API), if the browser has it
  function translateChrome(text, from, to) {
    var T = typeof self !== 'undefined' ? self.Translator : undefined;
    if (!T || !T.availability) return Promise.reject(new Error('Browser ohne Übersetzer'));
    var key = from + '>' + to;
    if (!chromeTranslators[key]) {
      // only use it if the language pack is already on the device (a download would block)
      chromeTranslators[key] = withTimeout(T.availability({ sourceLanguage: from, targetLanguage: to }), 3000).then(function (a) {
        if (a !== 'available') throw new Error('Sprachpaar ' + key + ': ' + a);
        return withTimeout(T.create({ sourceLanguage: from, targetLanguage: to }), 5000);
      });
      chromeTranslators[key].catch(function () { /* remembered as failed for this session */ });
    }
    return chromeTranslators[key].then(function (t) { return withTimeout(t.translate(text), 5000); });
  }

  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (res, rej) { setTimeout(function () { rej(new Error('Zeitüberschreitung')); }, ms); })]);
  }

  var myMemoryBlocked = false;
  // MyMemory: free web translation without key (daily limit for anonymous use)
  function translateMyMemory(text, from, to, f) {
    if (myMemoryBlocked) return Promise.reject(new Error('MyMemory-Tageslimit erreicht'));
    var url = 'https://api.mymemory.translated.net/get?' + qs({ q: text.slice(0, 450), langpair: from + '|' + to });
    return getJson(url, f).then(function (d) {
      var t = d && d.responseData && d.responseData.translatedText;
      if (d && (d.quotaFinished || +d.responseStatus === 429) || /MYMEMORY WARNING/i.test(t || '')) {
        myMemoryBlocked = true;
        throw new Error('MyMemory-Tageslimit erreicht');
      }
      if (!t || +d.responseStatus !== 200) throw new Error('MyMemory: ' + ((d && d.responseDetails) || 'Fehler'));
      return decodeEntities(t);
    });
  }

  /** Translates text; tries the providers in order. Resolves {text, via}. */
  function translate(text, from, to, f, order) {
    order = order || ['chrome', 'mymemory'];
    var i = 0;
    function next(err) {
      if (i >= order.length) return Promise.reject(err || new Error('Keine Übersetzung verfügbar'));
      var pr = order[i++];
      var p = pr === 'chrome' ? translateChrome(text, from, to)
        : pr === 'mymemory' ? withTimeout(translateMyMemory(text, from, to, f), 6000)
        : Promise.reject(new Error('Unbekannter Übersetzer ' + pr));
      return p.then(function (t) { return { text: t, via: pr }; }, next);
    }
    return next();
  }

  // ------------------------------------------------------ narration (v0.3)

  // Sections that carry no content for a spoken text
  var TAIL_SECTIONS = /^(references|notes|see also|external links|further reading|bibliography|sources|citations|footnotes|gallery|einzelnachweise|anmerkungen|weblinks|literatur|siehe auch|quellen|galerie|références|notes et références|voir aussi|liens externes|bibliographie|note|voci correlate|collegamenti esterni|bibliografia|referencias|véase también|enlaces externos)$/i;

  /** Plain article text: headings kept as own lines, reference/link sections at the end removed. */
  function cleanArticle(text) {
    var out = [], stop = false;
    String(text || '').split('\n').forEach(function (line) {
      if (stop) return;
      var m = line.match(/^\s*(=+)\s*(.*?)\s*\1\s*$/);
      if (m) {
        if (TAIL_SECTIONS.test(m[2])) { if (m[1].length <= 2) stop = true; return; }
        out.push('', m[2] + ':');
        return;
      }
      out.push(line.trim());
    });
    // drop headings without content
    var res = [];
    for (var i = 0; i < out.length; i++) {
      var isHead = /:$/.test(out[i]) && out[i - 1] === '';
      if (isHead) {
        var j = i + 1;
        while (j < out.length && out[j] === '') j++;
        if (j >= out.length || (/:$/.test(out[j]) && out[j - 1] === '')) continue;
      }
      res.push(out[i]);
    }
    return res.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** Cuts text to max characters at a sentence end. Returns {text, truncated}. */
  function cutAtSentence(text, max) {
    text = String(text || '');
    if (text.length <= max) return { text: text, truncated: false };
    var part = text.slice(0, max);
    var best = -1, re = /[.!?](?=\s)/g, m;
    while ((m = re.exec(part))) best = m.index;
    if (best < max * 0.5) best = part.lastIndexOf(' ');
    return { text: part.slice(0, best + 1).trim(), truncated: true };
  }

  /**
   * Loads the article used as source for narration and the detail view.
   * level: "kurz" = intro only, otherwise the whole article. Language: the longest article (PROJEKT.md 2).
   * Resolves {lang, title, text, intro, thumb, url}.
   */
  function loadArticle(p, level, f, retryDelays) {
    var w = String(p.wikipedia || ''), ix = w.indexOf(':');
    var a = ix > 0 ? { lang: w.slice(0, ix), title: w.slice(ix + 1) } : articleFor(p);
    if (!a) return Promise.reject(new Error('Kein Wikipedia-Artikel'));
    var params = {
      action: 'query', format: 'json', formatversion: 2, origin: '*', redirects: 1,
      prop: 'extracts|pageimages', explaintext: 1, exsectionformat: 'wiki',
      piprop: 'thumbnail', pithumbsize: 640, titles: a.title
    };
    if (level === 'kurz' && !p.abschnitt) params.exintro = 1; // a section of an article needs the whole text (v0.20.0)
    var url = 'https://' + a.lang + '.wikipedia.org/w/api.php?' + qs(params);
    return getJsonRetry(url, f, retryDelays).then(function (d) {
      var pg = (d.query && d.query.pages && d.query.pages[0]) || {};
      if (!pg.extract) throw new Error('Artikeltext nicht gefunden');
      var raw = p.abschnitt ? (sectionRaw(pg.extract, p.abschnitt) || pg.extract) : pg.extract;
      var text = cleanArticle(raw);
      var intro = text.split(/\n\n[^\n]+:\n/)[0].trim();
      if (p.abschnitt) intro = text; // the section is the source
      return {
        lang: a.lang, title: pg.title || a.title, text: text, intro: intro,
        thumb: pg.thumbnail ? pg.thumbnail.source : '',
        url: 'https://' + a.lang + '.wikipedia.org/wiki/' + encodeURIComponent((pg.title || a.title).replace(/ /g, '_'))
      };
    });
  }

  var LANG_NOM = { de: 'Deutsch', en: 'Englisch', fr: 'Französisch', it: 'Italienisch', es: 'Spanisch', nl: 'Niederländisch',
    pt: 'Portugiesisch', pl: 'Polnisch', cs: 'Tschechisch', sv: 'Schwedisch', da: 'Dänisch', no: 'Norwegisch', fi: 'Finnisch',
    el: 'Griechisch', ja: 'Japanisch', zh: 'Chinesisch', ru: 'Russisch', hu: 'Ungarisch', hr: 'Kroatisch', ro: 'Rumänisch' };

  /**
   * Builds the narration prompt (PROJEKT.md section 8) from the template in config.erzaehlen.
   * o: {article, level, schwerpunkt, distance (m or null)}. Resolves to {text, length, truncated}.
   */
  function buildPrompt(p, o, cfg) {
    var e = cfg.erzaehlen;
    var level = o.level || 'kurz';
    var art = o.article;
    var name = p.name + (p.name2 ? ' (deutsch: ' + p.name2 + ')' : '') + (p.ort && p.name.indexOf(p.ort) < 0 ? ', ' + p.ort : '');
    var tpl = (p.thema && cfg.gegend && cfg.gegend.vorlage) || e.vorlage; // v0.20.0: topics of the area have their own template
    if (p.thema) name = p.name + (p.abschnitt ? ', Abschnitt „' + p.abschnitt + '“' : '');
    var vars = {
      name: name, ort: p.ort || '', abschnitt: p.abschnitt || '',
      lat: p.lat != null ? p.lat.toFixed(5) : '', lon: p.lon != null ? p.lon.toFixed(5) : '',
      entfernung: o.distance != null ? ', etwa ' + formatDistance(o.distance) + ' von mir entfernt' : '',
      typ: p.typ_label || 'Sehenswürdigkeit',
      laenge_text: e.laenge_text[level],
      schwerpunkt: o.schwerpunkt || e.schwerpunkt_standard,
      quellsprache: art ? (LANG_NOM[art.lang] || art.lang) : '',
      quelle: art ? (LANG_NOM[art.lang] || art.lang) + ', Wikipedia' : (p.osm ? 'OpenStreetMap, kein Wikipedia-Artikel' : 'kein Wikipedia-Artikel'),
      gekuerzt: '',
      extrakt: '',
      wikivoyage: '',
      wikipedia_url: art ? art.url : ''
    };
    var src = art ? (level === 'kurz' ? art.intro : art.text) : '';
    if (!src) {
      src = e.ohne_artikel;
      var facts = p.osm ? osmFacts(p.osm.x) : '';
      if (facts) src += '\nAngaben aus OpenStreetMap: ' + facts;
      else if (p.beschreibung) src += '\nKurzbeschreibung: ' + p.beschreibung;
    }
    function render() {
      return tpl.map(function (line) {
        return line.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : ''; });
      }).filter(function (line) {
        return !(/^Reisetipp/.test(line) && !vars.wikivoyage); // drop the Wikivoyage line when empty
      }).join('\n').replace(/\n{3,}/g, '\n\n');
    }
    var max = e.max_zeichen || 12000;
    var room = max - render().length - 40;
    var lim = Math.min((e.quelltext_max && e.quelltext_max[level]) || 3000, room);
    var cut = cutAtSentence(src, lim);
    vars.extrakt = cut.text;
    if (cut.truncated) vars.gekuerzt = ' – ' + e.hinweis_gekuerzt;
    var text = render();
    return { text: text, length: text.length, truncated: cut.truncated };
  }

  /** Prompt "Lohnt sich das?": Claude searches visitor reviews (Google Maps, Tripadvisor, …) and sums them up. */
  function buildReviewPrompt(p, cfg, loc) {
    var b = cfg.besucher;
    // wo: region (canton/state from the reverse lookup, else the place), then the coordinates – "Waadt, 46.6191, 6.4116"
    var region = (loc && (loc.state || loc.name)) || p.ort || '';
    var vars = {
      name: p.name + (p.name2 ? ' (deutsch: ' + p.name2 + ')' : ''),
      wo: [region, (+p.lat).toFixed(4), (+p.lon).toFixed(4)].filter(Boolean).join(', '),
      lat: p.lat.toFixed(5), lon: p.lon.toFixed(5),
      typ: p.typ_label || 'Sehenswürdigkeit',
      wikipedia_url: p.wikipedia ? 'https://' + p.wikipedia.split(':')[0] + '.wikipedia.org/wiki/' +
        encodeURIComponent(p.wikipedia.slice(p.wikipedia.indexOf(':') + 1).replace(/ /g, '_')) : '–'
    };
    var text = b.vorlage.map(function (line) {
      return line.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : ''; });
    }).join('\n').replace(/\n{3,}/g, '\n\n');
    return { text: text, length: text.length, truncated: false };
  }

  /** v0.20.0: link to the Google AI search with the short review prompt (Google answers, the app reads nothing). */
  function reviewGoogleUrl(p, loc, cfg) {
    var g = cfg.google || {};
    return 'https://www.google.com/search?hl=' + encodeURIComponent(g.sprache || 'de') + (g.ki_param ? '&' + g.ki_param : '') +
      '&q=' + encodeURIComponent(buildReviewPrompt(p, cfg, loc).text);
  }

  function claudeNewUrl(prompt) { return 'claude://claude.ai/new?q=' + encodeURIComponent(prompt); }

  // ---------------------------------------------- "Gegend": topics of a place from its Wikipedia article (v0.20.0)
  // No curated list: the sections of the town article, the articles that the town article links to AND that link back (local things),
  // their kind from Wikidata (P31, labels in German whatever the article language) and their reading numbers give the groups.
  // Administration, politics, districts and settlements are left out; people come last. Everything is configured in config.json → gegend.

  /** Sections of a plain-text extract (exsectionformat=wiki): [{lvl, name, own, total}] – own = text of the section itself, total = with its subsections. */
  function sectionList(raw) {
    var secs = [], cur = null;
    String(raw || '').split('\n').forEach(function (line) {
      var m = line.match(/^\s*(=+)\s*(.*?)\s*\1\s*$/);
      if (m) { cur = { lvl: m[1].length, name: m[2], own: 0, total: 0 }; secs.push(cur); return; }
      if (cur) cur.own += line.length + 1;
    });
    secs.forEach(function (s, i) {
      s.total = s.own;
      for (var j = i + 1; j < secs.length && secs[j].lvl > s.lvl; j++) s.total += secs[j].own;
    });
    return secs;
  }
  /** The raw text of one section (with its subsections), still with its headings; '' if there is none of that name. */
  function sectionRaw(raw, name) {
    var lines = String(raw || '').split('\n'), out = [], lvl = 0, on = false;
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^\s*(=+)\s*(.*?)\s*\1\s*$/);
      if (m) {
        if (on && m[1].length <= lvl) break;
        if (!on && m[2] === name) { on = true; lvl = m[1].length; }
      }
      if (on) out.push(lines[i]);
    }
    return out.join('\n');
  }
  function reOf(s) { try { return new RegExp(s, 'i'); } catch (e) { return null; } }

  /**
   * data: {title, lang, extract, both: [titles], info: {title: {len, views, q}}, p31: {Q: [classId]}, clsLabel: {classId: label}, hits: [{title, wordcount, sectiontitle}]}
   * -> {sections: [{name, size}], groups: [{id, label, items: [{title, lab, views, len}]}], more: [...], people: [...], mentioned: [{title, wordcount}]}
   */
  function gegendTopics(data, cfg) {
    var g = cfg.gegend || {}, lang = data.lang || 'de';
    var skip = reOf((g.abschnitt_aus || {})[lang] || (g.abschnitt_aus || {}).de || '^$'), min = g.abschnitt_min_zeichen || 500, big3 = g.unterabschnitt_min_zeichen || 2000;
    var sections = sectionList(data.extract).filter(function (s) {
      if (skip && skip.test(s.name) || s.name === data.title) return false;
      return s.lvl === 2 ? s.total >= min : s.lvl === 3 ? s.own >= big3 : false;
    }).map(function (s) { return { name: s.name, size: s.lvl === 2 ? s.total : s.own, lvl: s.lvl }; })
      .sort(function (a, b) { return b.size - a.size; }).slice(0, g.abschnitte || 8);
    var excl = reOf(g.ausschluss_klassen || '^$'), person = reOf(g.person_klasse || '^Mensch$');
    var groups = (g.gruppen || []).map(function (x) { return { id: x.id, label: x.label, re: reOf(x.klassen), items: [] }; });
    var people = [], more = [];
    Object.keys(data.info || {}).forEach(function (t) {
      var x = data.info[t], labels = (data.p31[x.q] || []).map(function (c) { return data.clsLabel[c] || ''; }), lab = labels.join(' / ');
      var item = { title: x.title || t, lab: lab, views: x.views || 0, len: x.len || 0, score: Math.log10(1 + (x.views || 0)) * 2 + Math.log10(1 + (x.len || 0) / 1000) };
      if (labels.some(function (l) { return person.test(l); })) { people.push(item); return; }
      var grp = groups.filter(function (gr) { return gr.re && labels.some(function (l) { return gr.re.test(l); }); })[0];
      if (grp) grp.items.push(item);
      else if (!(excl && excl.test(lab)) && lab) more.push(item);
    });
    var by = function (a, b) { return b.score - a.score; };
    var seen = {};
    sections.forEach(function (s) { seen[s.name] = 1; });
    var listed = {};
    var out = {
      sections: sections,
      groups: groups.map(function (gr) { gr.items.sort(by); gr.items = gr.items.slice(0, g.pro_gruppe || 6); gr.items.forEach(function (i) { listed[i.title] = 1; }); return { id: gr.id, label: gr.label, items: gr.items }; }).filter(function (gr) { return gr.items.length; }),
      more: more.sort(by).slice(0, g.weiteres || 6),
      people: people.sort(by).slice(0, g.personen || 8),
      mentioned: (data.hits || []).filter(function (h) { return h.title !== data.title && !data.info[h.title] && !/^Liste (der|von) |Wahlkreis|Begriffsklärung/.test(h.title); })
        .slice(0, g.erwaehnt || 8).map(function (h) { return { title: h.title, wordcount: h.wordcount }; })
    };
    return out;
  }

  /** Loads the topics of a town: article (title in the given language) → sections, links both ways, readers, kinds. Returns Promise(gegendTopics result + {title, lang, url}). */
  function loadGegend(title, lang, f, cfg, onStep) {
    var g = cfg.gegend || {}, base = 'https://' + lang + '.wikipedia.org/w/api.php?', delays = [800, 2000];
    var step = function (t) { if (onStep) onStep(t); };
    var wp = function (o) { return getJsonRetry(base + qs(Object.assign({ format: 'json', formatversion: 2, origin: '*' }, o)), f, delays); };
    var wd = function (o) { return getJsonRetry('https://www.wikidata.org/w/api.php?' + qs(Object.assign({ format: 'json', origin: '*' }, o)), f, delays); };
    var data = { lang: lang, title: title, extract: '', both: [], info: {}, p31: {}, clsLabel: {}, hits: [] };
    function pages(prop, key, cont, acc) {
      return wp(Object.assign({ action: 'query', titles: title, prop: prop, [key + 'limit']: 500, [key + 'namespace']: 0 }, cont || {})).then(function (d) {
        var p = (d.query.pages || [])[0] || {};
        (p[prop] || []).forEach(function (x) { acc.push(x.title); });
        return d.continue && acc.length < 1500 ? pages(prop, key, d.continue, acc) : acc;
      });
    }
    function back(cont, acc) {
      return wp(Object.assign({ action: 'query', list: 'backlinks', bltitle: title, blnamespace: 0, bllimit: 500 }, cont || {})).then(function (d) {
        (d.query.backlinks || []).forEach(function (x) { acc.push(x.title); });
        return d.continue && acc.length < 2000 ? back(d.continue, acc) : acc;
      });
    }
    function info(titles) { // reading numbers need continuation: the API hands them out in portions
      var acc = {};
      function req(cont) {
        return wp(Object.assign({ action: 'query', prop: 'info|pageprops|pageviews', ppprop: 'wikibase_item', pvipdays: 60, redirects: 1, titles: titles.join('|') }, cont || {})).then(function (d) {
          (d.query.pages || []).forEach(function (p) {
            if (p.missing) return;
            var a = acc[p.title] = acc[p.title] || { title: p.title, len: 0, views: 0, q: '', pv: {} };
            if (p.length) a.len = p.length;
            if (p.pageprops && p.pageprops.wikibase_item) a.q = p.pageprops.wikibase_item;
            Object.keys(p.pageviews || {}).forEach(function (k) { a.pv[k] = p.pageviews[k] || 0; });
          });
          return d.continue ? req(d.continue) : acc;
        });
      }
      return req();
    }
    step('Lade den Ortsartikel …');
    return wp({ action: 'query', prop: 'extracts|pageprops', explaintext: 1, exsectionformat: 'wiki', redirects: 1, titles: title }).then(function (d) {
      var pg = (d.query.pages || [])[0] || {};
      if (pg.missing || !pg.extract) throw new Error('Kein Artikel „' + title + '“ (' + lang + ')');
      data.title = pg.title; data.extract = pg.extract;
      title = pg.title;
      step('Lade Verweise …');
      return Promise.all([pages('links', 'pl', null, []), back(null, []), wp({ action: 'query', list: 'search', srsearch: '"' + title + '"', srlimit: 30, srnamespace: 0, srprop: 'wordcount' })]);
    }).then(function (r) {
      var bset = {}; r[1].forEach(function (t) { bset[t] = 1; });
      data.both = r[0].filter(function (t) { return bset[t] && t !== title; }).slice(0, g.max_kandidaten || 200);
      data.hits = ((r[2].query || {}).search || []).map(function (h) { return { title: h.title, wordcount: h.wordcount }; });
      step('Lade Angaben zu ' + data.both.length + ' Artikeln …');
      var batches = [];
      for (var i = 0; i < data.both.length; i += 50) batches.push(data.both.slice(i, i + 50));
      return Promise.all(batches.map(info));
    }).then(function (parts) {
      parts.forEach(function (acc) {
        Object.keys(acc).forEach(function (t) {
          var a = acc[t], n = 0;
          Object.keys(a.pv).forEach(function (k) { n += a.pv[k]; });
          data.info[t] = { title: a.title, len: a.len, views: Math.round(n / 60 * 10) / 10, q: a.q };
        });
      });
      var qs2 = Object.keys(data.info).map(function (t) { return data.info[t].q; }).filter(Boolean), jobs = [];
      for (var i = 0; i < qs2.length; i += 50) jobs.push(qs2.slice(i, i + 50));
      step('Bestimme die Art der Themen …');
      return Promise.all(jobs.map(function (ids) {
        return wd({ action: 'wbgetentities', ids: ids.join('|'), props: 'claims' }).then(function (d) {
          Object.keys(d.entities || {}).forEach(function (q) {
            data.p31[q] = (((d.entities[q].claims || {}).P31) || []).map(function (c) { return c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.id; }).filter(Boolean);
          });
        });
      }));
    }).then(function () {
      var cls = {}, ids = [];
      Object.keys(data.p31).forEach(function (q) { data.p31[q].forEach(function (c) { if (!cls[c]) { cls[c] = 1; ids.push(c); } }); });
      var jobs = [];
      for (var i = 0; i < ids.length; i += 50) jobs.push(ids.slice(i, i + 50));
      return Promise.all(jobs.map(function (b) {
        return wd({ action: 'wbgetentities', ids: b.join('|'), props: 'labels', languages: 'de|en' }).then(function (d) {
          Object.keys(d.entities || {}).forEach(function (c) { var l = (d.entities[c].labels || {}); data.clsLabel[c] = (l.de || l.en || {}).value || ''; });
        });
      }));
    }).then(function () {
      var res = gegendTopics(data, cfg);
      res.title = data.title; res.lang = lang; res.extractLen = data.extract.length; res.q = '';
      res.url = 'https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(data.title.replace(/ /g, '_'));
      return res;
    });
  }

  /** Free search for a topic (Wikipedia full text): [{title, section, wordcount, snippet}] */
  function searchTopics(term, lang, f, cfg) {
    var url = 'https://' + lang + '.wikipedia.org/w/api.php?' + qs({ action: 'query', format: 'json', formatversion: 2, origin: '*', list: 'search', srsearch: term, srlimit: (cfg.gegend && cfg.gegend.suche_treffer) || 15, srnamespace: 0, srprop: 'snippet|wordcount|sectiontitle' });
    return getJsonRetry(url, f, [800, 2000]).then(function (d) {
      return ((d.query || {}).search || []).map(function (h) {
        return { title: h.title, section: h.sectiontitle || '', wordcount: h.wordcount || 0, snippet: String(h.snippet || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim() };
      });
    });
  }

  /** Wikipedia article of a Wikidata item in the first of these languages that has one: Promise({lang, title}|null). */
  function wikiTitleFor(qid, langs, f) {
    var url = 'https://www.wikidata.org/w/api.php?' + qs({ action: 'wbgetentities', format: 'json', origin: '*', ids: qid, props: 'sitelinks', sitefilter: langs.map(function (l) { return l + 'wiki'; }).join('|') });
    return getJsonRetry(url, f, [800, 2000]).then(function (d) {
      var sl = ((d.entities || {})[qid] || {}).sitelinks || {};
      for (var i = 0; i < langs.length; i++) if (sl[langs[i] + 'wiki']) return { lang: langs[i], title: sl[langs[i] + 'wiki'].title };
      return null;
    });
  }

  // ---------------------------------------------- OpenStreetMap (v0.4)

  /** Keys of the tiles (default 0.1°) that cover a search circle, e.g. "53.450,-2.300". */
  function tileKeys(lat, lon, radius, size) {
    size = size || 0.1;
    var dLat = radius / 111320, dLon = radius / (111320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    var keys = [];
    var f = function (x) { return Math.floor(x / size + 1e-9); };
    for (var a = f(lat - dLat); a <= f(lat + dLat); a++) {
      // 3 decimals: with 0.05° tiles, toFixed(1) gave two tiles the same key (bug in v0.4.1)
      for (var b = f(lon - dLon); b <= f(lon + dLon); b++) keys.push((a * size).toFixed(3) + ',' + (b * size).toFixed(3));
    }
    return keys;
  }

  function overpassQuery(key, cfg) {
    var size = cfg.osm.kachel_grad || 0.1;
    var p = key.split(',').map(Number);
    var bbox = [p[0], p[1], p[0] + size, p[1] + size].map(function (x) { return x.toFixed(4); }).join(',');
    var parts = (cfg.osm.filter || []).map(function (flt) { return 'nwr["name"]' + flt + '(' + bbox + ');'; });
    return '[out:json][timeout:' + (cfg.osm.server_timeout_s || 20) + '];(' + parts.join('') + ');out tags center qt;';
  }

  var OSM_KEYS = ['tourism', 'historic', 'amenity', 'leisure', 'natural', 'building', 'man_made'];
  var OSM_EXTRA = ['artist_name', 'artist', 'start_date', 'inscription', 'artwork_type', 'memorial', 'architect', 'denomination', 'heritage', 'description', 'ele'];

  /** Compact element (what is cached): position, names, Wikidata/Wikipedia link, main tag and a few facts. */
  function compactOsm(el) {
    var t = el.tags || {};
    var lat = el.lat != null ? el.lat : el.center && el.center.lat, lon = el.lon != null ? el.lon : el.center && el.center.lon;
    if (lat == null || lon == null || !t.name) return null;
    var k = '';
    for (var i = 0; i < OSM_KEYS.length && !k; i++) if (t[OSM_KEYS[i]] && t[OSM_KEYS[i]] !== 'yes') k = OSM_KEYS[i] + '=' + t[OSM_KEYS[i]];
    var x = {};
    OSM_EXTRA.forEach(function (n) { if (t[n]) x[n] = String(t[n]).slice(0, 300); });
    var names = {};
    Object.keys(t).forEach(function (n) { var m = n.match(/^name:([a-z]{2})$/); if (m) names[m[1]] = t[n]; });
    return {
      id: el.type + '/' + el.id, lat: +lat.toFixed(6), lon: +lon.toFixed(6), name: t.name, names: names,
      wd: /^Q\d+$/.test(t.wikidata || '') ? t.wikidata : '', wp: t.wikipedia || '', k: k, x: x
    };
  }

  /**
   * One tile from Overpass (cache {get(key) -> Promise, set(key, value) -> Promise}, 30 days).
   * Tries the configured servers one after the other.
   */
  // v0.11.0: OSM prepared as files (GitHub Action from a Geofabrik extract, e.g. Switzerland) – no Overpass where they exist.
  // The app sets a function key -> null (no file for this tile) or {stand, load() -> Promise of compact elements}.
  var osmStatic = null;
  function setOsmStatic(fn) { osmStatic = typeof fn === 'function' ? fn : null; }
  function osmFile(key) { try { return osmStatic ? osmStatic(key) : null; } catch (e) { return null; } }

  function loadOsmTile(key, cfg, f, cache, cacheOnly) {
    var ttl = (cfg.osm.cache_tage || 30) * 24 * 3600 * 1000;
    var ck = 'osm:' + (cfg.osm.version || 1) + ':' + key;
    var cached = cache ? Promise.race([Promise.resolve(cache.get(ck)), sleep(2000).then(function () { return null; })]) : Promise.resolve(null);
    var file = osmFile(key);
    return cached.catch(function () { return null; }).then(function (hit) {
      if (file) {
        // the stored tile is good as long as it is of the same data state (stand)
        if (hit && hit.s === file.stand) return { els: hit.els, cached: true, file: true };
        return Promise.resolve(file.load()).then(function (els) {
          els = (els || []).filter(Boolean);
          if (cache) Promise.resolve(cache.set(ck, { t: Date.now(), s: file.stand, els: els })).catch(function () {});
          return { els: els, cached: false, file: true, server: 'Datei' };
        }).catch(function (e) { if (hit) return { els: hit.els, cached: true }; throw e; });
      }
      if (hit && Date.now() - hit.t < ttl) return { els: hit.els, cached: true };
      if (cacheOnly) return { els: [], cached: true, missing: true }; // v0.6.1: do not compete with a running preparation
      var q = overpassQuery(key, cfg), servers = cfg.osm.server || ['https://overpass-api.de/api/interpreter'];
      var i = 0, lastErr = null, used = '';
      function next() {
        if (i >= servers.length) return Promise.reject(lastErr || new Error('Overpass nicht erreichbar'));
        used = servers[i].replace(/^https?:\/\/([^/]+).*$/, '$1');
        var url = servers[i++] + '?data=' + encodeURIComponent(q);
        return getJson(url, f, ((cfg.osm.server_timeout_s || 20) + 5) * 1000).then(function (d) {
          if (d && d.remark && /runtime error|timed out|out of memory/i.test(d.remark)) throw new Error('Overpass: ' + d.remark);
          return d;
        }).catch(function (e) { lastErr = e; return next(); });
      }
      return next().then(function (d) {
        var els = (d.elements || []).map(compactOsm).filter(Boolean);
        if (cache) Promise.resolve(cache.set(ck, { t: Date.now(), els: els })).catch(function () {});
        return { els: els, cached: false, server: used };
      });
    });
  }

  /** All OSM elements within the radius (tiles in parallel, max `parallel` at a time). */
  function loadOsm(lat, lon, radius, cfg, f, cache, onProgress) {
    return loadOsmArea([{ lat: lat, lon: lon, radius: radius }], cfg, f, cache, onProgress);
  }

  /** OSM tiles for the circles; with bbox only those that touch it (v0.9.3: the circle around a section is much bigger). */
  function osmTileKeys(circles, cfg, bbox) {
    var keys = [], have = {}, size = cfg.osm.kachel_grad || 0.1;
    circles.forEach(function (c) {
      tileKeys(c.lat, c.lon, c.radius, size).forEach(function (k) {
        if (have[k]) return;
        if (bbox) {
          var p = k.split(',').map(Number);
          if (p[0] >= bbox.north || p[0] + size <= bbox.south || p[1] >= bbox.east || p[1] + size <= bbox.west) return;
        }
        have[k] = 1; keys.push(k);
      });
    });
    return keys;
  }

  /** All OSM elements inside any of the circles (and bbox, if given); every tile is loaded once. */
  function loadOsmArea(circles, cfg, f, cache, onProgress, cacheOnly, bbox) {
    var keys = osmTileKeys(circles, cfg, bbox);
    var seen = {}, out = [], done = 0, requests = 0, failed = 0, cachedTiles = 0, missing = 0, servers = {};
    return runLimited(keys, cfg.osm.parallel || 2, function (key) {
      return loadOsmTile(key, cfg, f, cache, cacheOnly).then(function (r) {
        if (r.missing) missing++; else if (r.cached) cachedTiles++; else requests++;
        if (r.server) servers[r.server] = 1;
        r.els.forEach(function (e) {
          if (seen[e.id] || !insideAny(circles, e.lat, e.lon)) return;
          seen[e.id] = 1; out.push(e);
        });
      }, function () { failed++; }).then(function () {
        done++;
        if (onProgress) onProgress(done, keys.length);
      });
    }).then(function () {
      if (failed === keys.length) throw new Error('OpenStreetMap nicht erreichbar');
      return { els: out, tiles: keys.length, requests: requests, cachedTiles: cachedTiles, missingTiles: missing, failedTiles: failed, servers: Object.keys(servers) };
    });
  }

  // ---- duplicates (PROJEKT.md 5b)

  var NAME_STOP = { the: 1, der: 1, die: 1, das: 1, le: 1, la: 1, les: 1, l: 1, de: 1, du: 1, des: 1, of: 1, von: 1, st: 1, saint: 1, sankt: 1, and: 1, und: 1, et: 1 };
  function normName(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ')
      .split(' ').filter(function (w) { return w && !NAME_STOP[w]; }).join(' ');
  }
  function bigrams(s) { var o = {}; s = s.replace(/ /g, ''); for (var i = 0; i < s.length - 1; i++) { var b = s.slice(i, i + 2); o[b] = (o[b] || 0) + 1; } return o; }
  /** Name similarity 0..1 (Dice coefficient on letter pairs, after normalising). */
  function nameSimilarity(a, b) {
    a = normName(a); b = normName(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    var A = bigrams(a), B = bigrams(b), inter = 0, na = 0, nb = 0, k;
    for (k in A) { na += A[k]; if (B[k]) inter += Math.min(A[k], B[k]); }
    for (k in B) nb += B[k];
    return na + nb ? 2 * inter / (na + nb) : 0;
  }
  function osmNames(e) { return [e.name].concat(Object.keys(e.names || {}).map(function (l) { return e.names[l]; })); }
  function placeNames(p) {
    var n = [p.name, p.name2];
    Object.keys(p.artikel || {}).forEach(function (l) { n.push(cleanTitle(p.artikel[l])); });
    Object.keys(p.namen || {}).forEach(function (l) { n.push(p.namen[l]); });
    return n.filter(Boolean);
  }
  function bestSimilarity(na, nb) {
    var best = 0;
    na.forEach(function (a) { nb.forEach(function (b) { best = Math.max(best, nameSimilarity(a, b)); }); });
    return best;
  }

  function osmTypeOf(e, cfg) {
    var map = cfg.osm.typen || {};
    return map[e.k] || map[(e.k || '').split('=')[0] + '=*'] || 'sonstiges';
  }

  /** Short facts from OSM tags, e.g. "Künstler: Glyn Hughes; Entstehung: 2001". */
  function osmFacts(x) {
    var L = { artist_name: 'Künstler', artist: 'Künstler', architect: 'Architekt', start_date: 'Entstehung', inscription: 'Inschrift',
      artwork_type: 'Art', memorial: 'Art', denomination: 'Konfession', description: 'Beschreibung' };
    var seen = {};
    return Object.keys(x || {}).filter(function (k) { return L[k] && !(seen[L[k]] && k !== 'description') && (seen[L[k]] = 1); })
      .map(function (k) { return L[k] + ': ' + x[k]; }).join('; ');
  }

  function rescore(p, cfg) {
    var sc = computeScore(p, cfg);
    p.score = sc.score; p.teile = sc.teile;
    p.sterne = starsFor(p.score, p.typ, cfg);
    p.dauer_min = (cfg.dauer_min && cfg.dauer_min[String(p.sterne)]) || 0;
  }

  /**
   * Merges OSM elements into the Wikipedia places (in place) and adds new places from OSM.
   * Order (PROJEKT.md 5b): same Wikidata id, else similar name (>= threshold) within max distance; when in doubt keep both.
   * wd/classes: Wikidata info for OSM elements whose Wikidata item has no Wikipedia article nearby.
   */
  function mergeOsm(places, els, wd, classes, cfg, center, localLang) {
    var dup = cfg.osm.duplikat || {}, simMin = dup.aehnlichkeit || 0.85, maxDist = dup.abstand_m || 150;
    var byWd = {};
    places.forEach(function (p) { if (p.wikidata) byWd[p.wikidata] = p; });
    var stats = { w: places.length, o: els.length, byWikidata: 0, byName: 0, osmDup: 0, neu: 0 };
    var added = [];
    function attach(p, e) {
      if (p.quellen.indexOf('O') < 0) p.quellen.push('O');
      p.osm = p.osm || { id: e.id, k: e.k, x: e.x };
      if (p.typ === 'sonstiges' || typeInfo(p.typ, cfg).generisch) {
        var ot = osmTypeOf(e, cfg);
        if (ot !== 'sonstiges') { var t = typeInfo(ot, cfg); p.typ = ot; p.typ_label = t.label; p.kategorie = t.kategorie || 'sonstiges'; }
      }
      rescore(p, cfg);
    }
    function nearSimilar(list, e) {
      var best = null, bs = 0, en = osmNames(e);
      list.forEach(function (p) {
        if (haversine(p.lat, p.lon, e.lat, e.lon) > maxDist) return;
        var s = bestSimilarity(en, placeNames(p));
        if (s >= simMin && s > bs) { bs = s; best = p; }
      });
      return best;
    }
    els.forEach(function (e) {
      if (e.wd && byWd[e.wd]) { attach(byWd[e.wd], e); stats.byWikidata++; return; }
      var p = nearSimilar(places, e);
      if (p) { attach(p, e); stats.byName++; return; }
      var q = nearSimilar(added, e) || (e.wd && added.filter(function (a) { return a.wikidata === e.wd; })[0]);
      if (q) { stats.osmDup++; return; } // same object twice in OSM (e.g. node and building)
      var np = buildOsmPlace(e, wd && e.wd ? wd[e.wd] : null, classes || {}, cfg, center, localLang);
      added.push(np);
      if (np.wikidata) byWd[np.wikidata] = np;
      stats.neu++;
    });
    stats.after = places.length + added.length;
    return { places: places.concat(added), stats: stats };
  }

  /** New place from OSM. With a Wikidata item it is scored like a Wikipedia place, otherwise by the OSM rule. */
  function buildOsmPlace(e, info, classes, cfg, center, localLang) {
    var names = { local: e.names[localLang] || e.name, de: e.names.de || (info && info.lab && info.lab.de) || '', en: e.names.en || (info && info.lab && info.lab.en) || '' };
    var nm = pickNames(names);
    var artikel = {}, wikipedia = '';
    var wp = String(e.wp || '').match(/^([a-z-]{2,12}):(.+)$/);
    if (wp) { artikel[wp[1]] = wp[2]; wikipedia = wp[1] + ':' + wp[2]; }
    var typ = 'sonstiges', classLabels = [];
    if (info) {
      (info.p31 || []).forEach(function (q) { var c = classes[q]; if (c) classLabels.push(c.en, c.de); });
      var dsc = info.desc || {};
      typ = classify(info.p31, classLabels, [dsc.en, dsc.de, localLang ? dsc[localLang] : ''], [e.name], cfg);
    }
    if (typ === 'sonstiges' || typeInfo(typ, cfg).generisch) {
      var ot = osmTypeOf(e, cfg);
      if (ot !== 'sonstiges' || typ === 'sonstiges') typ = ot;
    }
    var t = typeInfo(typ, cfg);
    var p = {
      id: e.wd ? 'wd:' + e.wd : 'osm:' + e.id,
      name: nm.name || e.name, name2: nm.name2, namen: names,
      lat: e.lat, lon: e.lon,
      wikidata: e.wd || null, wikipedia: wikipedia, artikel: artikel,
      typ: typ, typ_label: t.label, kategorie: t.kategorie || 'sonstiges',
      quellen: ['O'], sterne: 0, geheimtipp: false, geprueft: true, warum: '', dauer_min: 0,
      beschreibung: (e.x && e.x.description) || (info && info.desc ? (info.desc.de || info.desc.en || '') : '') || osmFacts(e.x),
      klassen: classLabels.filter(Boolean).slice(0, 4),
      sprachversionen: info ? info.s : 0, laenge: 0,
      denkmal: info ? info.h : (e.x && e.x.heritage ? ['osm-heritage'] : []), unesco: info ? info.u : false,
      osm: { id: e.id, k: e.k, x: e.x }, ort: ''
    };
    if (info) {
      rescore(p, cfg);
    } else {
      // OSM only (no Wikidata): base value + type + heritage, at most ★ unless a second source confirms (PROJEKT.md 6)
      var o = cfg.osm.ohne_wikidata || {};
      p.osmOnly = true;
      p.teile = { osm_basis: o.basis || 3, denkmal: p.denkmal.length ? (cfg.score.denkmal_bonus.denkmal || 1) : 0, typ: t.gewicht || 0 };
      p.score = round1(p.teile.osm_basis + p.teile.denkmal + p.teile.typ);
      var s = starsFor(p.score, typ, cfg);
      s = Math.min(s, typeof o.max_sterne === 'number' ? o.max_sterne : 1);
      if (typeof t.min_sterne === 'number') s = Math.max(s, t.min_sterne);
      p.sterne = s;
      p.dauer_min = (cfg.dauer_min && cfg.dauer_min[String(p.sterne)]) || 0;
    }
    p.dist = center ? Math.round(haversine(center.lat, center.lon, p.lat, p.lon)) : null;
    return p;
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
  // OsmAnd (v0.5). Three ways to open it; diag.html tests which one works on the phone.
  function osmandWebUrl(p, z) {
    var la = p.lat.toFixed(6), lo = p.lon.toFixed(6);
    return 'https://osmand.net/map?pin=' + la + ',' + lo + '#' + (z || 17) + '/' + la + '/' + lo;
  }
  function osmandGoUrl(p, z) {
    return 'https://osmand.net/go?lat=' + p.lat.toFixed(6) + '&lon=' + p.lon.toFixed(6) + '&z=' + (z || 17);
  }
  /** Android intent link: opens OsmAnd+ (package) directly; without the app the web map opens. */
  function osmandIntentUrl(p, pkg, z) {
    var web = osmandWebUrl(p, z);
    return 'intent://' + web.replace(/^https:\/\//, '').replace(/#.*$/, '') + '#Intent;scheme=https;package=' + (pkg || 'net.osmand.plus') +
      ';S.browser_fallback_url=' + encodeURIComponent(web) + ';end';
  }

  /** Link to the longest (most detailed) article, in whatever language (v0.6.1, user decision). */
  function wikipediaUrl(p) {
    var w = String(p.wikipedia || ''), ix = w.indexOf(':');
    var lang = ix > 0 ? w.slice(0, ix) : (p.artikel && p.artikel.de ? 'de' : 'en');
    var title = ix > 0 ? w.slice(ix + 1) : ((p.artikel && p.artikel[lang]) || '');
    return 'https://' + lang + '.m.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));
  }
  /**
   * v0.13.0: links to Google for a place that has nothing (much) in our data. They open in their own window (target _blank);
   * the app cannot read the answer, it only hands over the question.
   * loc: {name, state} from reverse geocoding, or null. Question and instruction come from cfg.google.
   *   ai     – Google "KI-Modus" (udm=50; not documented by Google, may change), the question with the instruction
   *   search – normal search with the name and the place
   *   images – Google Images with the name and the place
   */
  function googleWhere(p, loc) {
    if (loc && loc.name) return loc.name + (loc.state && loc.state !== loc.name ? ' (' + loc.state + ')' : '');
    if (p.ort) return p.ort;
    return '';
  }
  function googleLinks(p, loc, cfg) {
    var g = (cfg && cfg.google) || {}, name = displayName(p.name), where = googleWhere(p, loc);
    var coords = p.lat != null && p.lon != null ? 'Koordinaten ' + (+p.lat).toFixed(4) + ', ' + (+p.lon).toFixed(4) : '';
    var at = where ? ' in ' + where : coords ? ' (' + coords + ')' : '';
    var frage = (g.frage || 'Was ist „{name}“{ort}?').replace('{name}', name).replace('{ort}', at);
    var text = frage + (g.auftrag ? ' ' + g.auftrag : '');
    var hl = g.sprache || 'de', base = 'https://www.google.com/search?hl=' + encodeURIComponent(hl);
    var plain = name + (where ? ' ' + where : coords ? ' ' + (+p.lat).toFixed(4) + ' ' + (+p.lon).toFixed(4) : '');
    return {
      ai: base + (g.ki_param ? '&' + g.ki_param : '') + '&q=' + encodeURIComponent(text),
      search: base + '&q=' + encodeURIComponent(plain),
      images: base + '&tbm=isch&q=' + encodeURIComponent(plain),
      text: text
    };
  }
  /** Height as text: "1 068 m" (non-breaking thousands space, like the rest of the app). */
  function heightText(m) {
    var n = Math.round(+m);
    return isFinite(n) && n > 0 ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + ' m' : '';
  }
  /** One line from the package info: [Wikidata description, height in m] plus the OSM height tag. '' if there is nothing. */
  function infoLine(rec, osmEle) {
    var d = rec && rec[0] ? String(rec[0]) : '', e = rec && rec[1] ? rec[1] : osmEle;
    var h = heightText(typeof e === 'string' ? parseFloat(e.replace(',', '.')) : e);
    d = d.charAt(0).toUpperCase() + d.slice(1);
    return [d, h].filter(Boolean).join(' · ');
  }
  function tripadvisorUrl(p) {
    return 'https://www.tripadvisor.de/Search?q=' + encodeURIComponent(nameWithPlace(p));
  }
  function merkZeile(p) {
    return [p.name, p.sterne ? starsText(p.sterne) : 'ohne Stern', p.ort || '–', gmapsSearchUrl(p)].join(' – ');
  }

  // ------------------------------------------------- map symbols (v0.7.0)

  /** Symbol group for a place type (config "symbole"), '' = plain dot. */
  function iconFor(typ, cfg) {
    var s = (cfg && cfg.symbole) || {};
    for (var k in s) if (k.charAt(0) !== '_' && s[k].indexOf(typ) >= 0) return k;
    return '';
  }

  // ------------------------------------------------ city stars (v0.7.0)
  // PROJEKT.md 6c. One Wikidata query per map tile (1°, split on failure) gives every item with
  // coordinates and enough language versions: settlements become city candidates, everything else
  // counts as a sight. City score = sum of the best sights within the city radius + bonuses.

  function cityTiles(bbox, deg) {
    deg = deg || 1;
    var out = [], f = function (x) { return Math.floor(x / deg + 1e-9) * deg; };
    for (var s = f(bbox.south); s < bbox.north - 1e-9; s += deg) {
      for (var w = f(bbox.west); w < bbox.east - 1e-9; w += deg) {
        out.push({ south: +s.toFixed(4), west: +w.toFixed(4), north: +(s + deg).toFixed(4), east: +(w + deg).toFixed(4) });
      }
    }
    return out;
  }
  function tileKey(t) { return [t.south, t.west, t.north, t.east].join(','); }
  function splitTile(t) {
    var ms = (t.south + t.north) / 2, mw = (t.west + t.east) / 2;
    return [
      { south: t.south, west: t.west, north: ms, east: mw }, { south: t.south, west: mw, north: ms, east: t.east },
      { south: ms, west: t.west, north: t.north, east: mw }, { south: ms, west: mw, north: t.north, east: t.east }
    ];
  }

  function citySparql(t, cfg) {
    var c = cfg.staedte, min = c.min_sprachversionen || 12;
    var en = function (v) { return 'STRAFTER(STR(' + v + '),"entity/")'; };
    var tl = c.titel_in_abfrage ? c.titel_sprachen || [] : [], sel = '', opt = '';
    tl.forEach(function (l) {
      sel += ' (SAMPLE(?t_' + l + ') AS ?t_' + l + ')';
      opt += ' OPTIONAL { ?a_' + l + ' schema:about ?item; schema:isPartOf <https://' + l + '.wikipedia.org/>; schema:name ?t_' + l + '. }';
    });
    if (c.wikivoyage && c.titel_in_abfrage) {
      sel += ' (SAMPLE(?wv1) AS ?wv)';
      opt += ' OPTIONAL { ?wv1 schema:about ?item; schema:isPartOf ?wvs. FILTER(?wvs IN (<https://de.wikivoyage.org/>, <https://en.wikivoyage.org/>, <https://fr.wikivoyage.org/>, <https://it.wikivoyage.org/>)) }';
    }
    return 'SELECT ?item (SAMPLE(?c) AS ?coord) (SAMPLE(?s) AS ?sl) (MAX(?p) AS ?pop) (MAX(?ar) AS ?area)' +
      ' (GROUP_CONCAT(DISTINCT ' + en('?t') + ';separator="|") AS ?p31)' +
      ' (GROUP_CONCAT(DISTINCT ?tl;separator="|") AS ?cls)' +
      ' (GROUP_CONCAT(DISTINCT ' + en('?h') + ';separator="|") AS ?her)' +
      ' (GROUP_CONCAT(DISTINCT ' + en('?land') + ';separator="|") AS ?land)' +
      ' (SAMPLE(?u) AS ?unesco) (SAMPLE(?cp) AS ?cap) (SAMPLE(?ld) AS ?de) (SAMPLE(?le) AS ?en) (SAMPLE(?lx) AS ?lx) (SAMPLE(?ds) AS ?desc)' + sel +
      ' WHERE {' +
      ' SERVICE wikibase:box { ?item wdt:P625 ?c. bd:serviceParam wikibase:cornerSouthWest "Point(' + t.west + ' ' + t.south + ')"^^geo:wktLiteral;' +
      ' wikibase:cornerNorthEast "Point(' + t.east + ' ' + t.north + ')"^^geo:wktLiteral. }' +
      ' ?item wikibase:sitelinks ?s. FILTER(?s >= ' + min + ')' +
      ' OPTIONAL { ?item wdt:P31 ?t. OPTIONAL { ?t rdfs:label ?tl. FILTER(LANG(?tl) = "en") } }' +
      ' OPTIONAL { ?item wdt:P1082 ?p. }' +
      ' OPTIONAL { ?item p:P2046/psn:P2046/wikibase:quantityAmount ?ar. }' +
      ' OPTIONAL { ?item wdt:P1435 ?h. }' +
      ' OPTIONAL { ?item wdt:P17 ?land. }' +
      ' OPTIONAL { ?item wdt:P757 ?u. }' +
      ' OPTIONAL { ?item wdt:P1376 ?cp. }' +
      ' OPTIONAL { ?item rdfs:label ?ld. FILTER(LANG(?ld) = "de") }' +
      ' OPTIONAL { ?item rdfs:label ?le. FILTER(LANG(?le) = "en") }' +
      ' OPTIONAL { ?item rdfs:label ?lx. FILTER(LANG(?lx) IN ("mul", "fr", "it", "nl")) }' +
      ' OPTIONAL { ?item schema:description ?ds. FILTER(LANG(?ds) = "en") }' + opt +
      ' } GROUP BY ?item';
  }

  function parseCityRows(d) {
    var rows = (d && d.results && d.results.bindings) || [];
    var v = function (b, k) { return b[k] ? b[k].value : ''; };
    var list = function (s) { return s ? s.split('|').filter(Boolean) : []; };
    return rows.map(function (b) {
      var m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(v(b, 'coord'));
      if (!m) return null;
      return {
        q: v(b, 'item').replace(/^.*\//, ''), lat: +(+m[2]).toFixed(5), lon: +(+m[1]).toFixed(5),
        name: v(b, 'de') || v(b, 'en') || v(b, 'lx'), name_en: v(b, 'en'),
        sl: +v(b, 'sl') || 0, pop: Math.round(+v(b, 'pop') || 0), km2: Math.round((+v(b, 'area') || 0) / 1e4) / 100,
        p31: list(v(b, 'p31')), cls: list(v(b, 'cls')), h: list(v(b, 'her')), land: list(v(b, 'land')),
        u: !!v(b, 'unesco'), cap: !!v(b, 'cap'), desc: v(b, 'desc'),
        titel: Object.keys(b).filter(function (k) { return /^t_[a-z]+$/.test(k); }).reduce(function (o, k) { o[k.slice(2)] = b[k].value; return o; }, {}),
        wv: !!v(b, 'wv')
      };
    }).filter(function (x) { return x && x.name; });
  }

  /**
   * Loads the items of all tiles (one after the other; Wikidata asks for no parallel bulk queries).
   * A tile that fails (timeout, HTTP 5xx) is split into four, at most `teilen_max` times.
   * o: {cache: Map-like {get,set} tileKey -> items, onProgress(done, total, items), control: {cancelled}}
   */
  function loadCityTiles(tiles, cfg, f, o) {
    o = o || {};
    var c = cfg.staedte, url = c.sparql || 'https://query.wikidata.org/sparql';
    var queue = tiles.map(function (t) { return { t: t, depth: 0 }; });
    var total = queue.length, done = 0, items = {}, failed = [], queries = 0, splits = 0, t0 = Date.now();
    function add(list) { list.forEach(function (x) { if (!items[x.q]) items[x.q] = x; }); }
    function one(job, attempt) {
      var key = tileKey(job.t);
      var hit = o.cache && o.cache.get(key);
      if (hit) return Promise.resolve(hit);
      queries++;
      return getJson(url + '?format=json&query=' + encodeURIComponent(citySparql(job.t, cfg)), f, (c.timeout_s || 70) * 1000)
        .then(function (d) {
          var list = parseCityRows(d);
          if (o.cache) o.cache.set(key, list);
          return list;
        }, function (e) {
          if (e && e.status === 429 && attempt < 4) return sleep((c.pause_429_s || 30) * 1000).then(function () { return one(job, attempt + 1); });
          if (e && e.status >= 400 && e.status < 500 && e.status !== 429) throw e; // query error: splitting does not help
          if (job.depth < (c.teilen_max || 2)) { e.split = true; throw e; }
          if (attempt < 1) return sleep(5000).then(function () { return one(job, attempt + 1); });
          throw e;
        });
    }
    function next() {
      if (o.control && o.control.cancelled) return Promise.resolve();
      var job = queue.shift();
      if (!job) return Promise.resolve();
      return one(job, 0).then(function (list) { add(list); done++; }, function (e) {
        if (e && e.split) {
          splits++;
          splitTile(job.t).forEach(function (t) { queue.unshift({ t: t, depth: job.depth + 1 }); });
          total += 3;
        } else { failed.push({ tile: job.t, error: (e && e.message) || 'Fehler' }); done++; }
      }).then(function () {
        if (o.onProgress) o.onProgress(done, total, Object.keys(items).length);
        return queries && c.pause_ms ? sleep(c.pause_ms) : null;
      }).then(next);
    }
    return next().then(function () {
      return { items: Object.keys(items).map(function (k) { return items[k]; }), tiles: total, failed: failed, queries: queries, splits: splits, ms: Date.now() - t0 };
    });
  }

  function anyHeadEnds(labels, words) {
    var ws = words.map(function (w) { return { suffix: false, w: norm(w) }; });
    return (labels || []).some(function (l) {
      var h = headPhrase(l);
      return ws.some(function (w) { return endsWithWord(h, w); });
    });
  }
  // A settlement: class like "commune of France", "town"; without population only a clear "city/town/village"
  // (so that e.g. "Paris Commune", an insurgency, is no city).
  // Administrative units that also carry a city word ("metropolitan city of Italy", "Communauté urbaine", "county borough")
  // are no city, unless one class is plainly "city"/"town" (Cardiff is a city and a principal area).
  function isCityItem(x, cfg) {
    var c = cfg.staedte;
    if (!anyHeadEnds(x.cls, c.stadt_woerter || [])) return false;
    var sicher = (c.stadt_sicher_woerter || ['city', 'town', 'village']).map(function (w) { return norm(w); });
    var plain = (x.cls || []).some(function (l) { return sicher.indexOf(headPhrase(l)) >= 0; });
    var full = (x.cls || []).map(function (l) { return norm(l); });
    var keine = (c.keine_stadt_klassen || []).some(function (w) { var n = norm(w); return full.some(function (l) { return l.indexOf(n) >= 0; }); });
    if (keine && !plain) return false;
    return x.pop > 0 || anyHeadEnds(x.cls, c.stadt_sicher_woerter || ['city', 'town', 'village']);
  }

  /** Radius in metres: from the area (circle of the same size, +10 %) if known, else from the population. */
  function cityRadius(pop, cfg, km2) {
    var r = cfg.staedte.radius_km || {};
    var km = km2 > 0 ? 1.1 * Math.sqrt(km2 / Math.PI)
      : (r.basis || 1.5) + (r.pro_zehnfach || 1.5) * Math.max(0, Math.log(Math.max(pop || 0, 1000) / 1000) / Math.LN10);
    return Math.max(r.min || 1, Math.min(r.max || 8, km)) * 1000;
  }

  /** Points of one sight (score from PROJEKT.md 6 without article length), or null if it does not count. */
  function isUnesco(x, cfg) {
    var uq = cfg.score.unesco_qids || [];
    return !!x.u || (x.h || []).some(function (q) { return uq.indexOf(q) >= 0; });
  }
  // ------------------------------------------------------- personal interest profile (v0.16.0)
  // Added to the points of a sight (config verzeichnis.profil): art and history museums up, little-known science/technology museums down,
  // viewpoints like museums, castles/monasteries/manors a little up. The classes are the Wikidata labels of the item (x.cls).
  function clsHas(joined, words) {
    return (words || []).some(function (w) { return joined.indexOf(String(w).toLowerCase()) >= 0; });
  }
  function profileDelta(x, typ, cfg) {
    var p = cfg.verzeichnis && cfg.verzeichnis.profil, out = { d: 0, av: false };
    if (!p) return out;
    var s = (x.cls || []).join(' | ').toLowerCase();
    if (typ === 'museum') {
      if (clsHas(s, p.kunst_klassen)) out.d += p.kunstmuseum || 0;
      else if (clsHas(s.replace(/natural history( museum)?/g, ''), p.geschichte_klassen)) out.d += p.geschichtsmuseum || 0;
      else if (clsHas(s, p.spezial_klassen) && (x.sl || 0) < (p.spezial_bis_sprachen || 0)) out.d += p.spezialmuseum || 0;
    }
    if ((p.geschichte_typen || []).indexOf(typ) >= 0 || (typ === 'turm' && clsHas(s, p.geschichte_klassen_turm))) out.d += p.geschichte || 0;
    if (typ === 'aussicht' || clsHas(s, p.aussicht_klassen)) { out.d += p.aussicht || 0; out.av = true; }
    return out;
  }

  /** Directory items (stored form, with _s) whose Wikidata number belongs to an OSM viewpoint get the `aussicht` bonus once (not if their class said so already). Returns the count. */
  function applyViewpoints(items, osmEls, cfg) {
    var p = cfg.verzeichnis && cfg.verzeichnis.profil, bonus = (p && p.aussicht) || 0, views = {}, n = 0;
    if (!bonus) return 0;
    (osmEls || []).forEach(function (e) { if (e.k === 'tourism=viewpoint' && e.wd) views[e.wd] = true; });
    (items || []).forEach(function (x) {
      if (x.q && views[x.q] && x._s && !x._s.av) { x._s.score = round1(x._s.score + bonus); x._s.av = true; n++; }
    });
    return n;
  }

  function sightScore(x, cfg) {
    var c = cfg.staedte;
    var typ = classify(x.p31, x.cls, [x.desc], [x.name_en || x.name], cfg);
    if (isUnesco(x, cfg)) {
      // World Heritage (e.g. "old town of Bamberg", class "historic district") always counts
      x.u = true;
      var tu = typeInfo(typ, cfg);
      if (typ === 'sonstiges' || tu.max_sterne === 0 || (c.ausschluss_typen || []).indexOf(typ) >= 0) typ = 'welterbe';
    } else {
      if (anyHeadEnds(x.cls, c.ausschluss_woerter || [])) return null;
      if ((c.ausschluss_typen || []).indexOf(typ) >= 0) return null;
      if (typeInfo(typ, cfg).max_sterne === 0) return null;
      // only things one can visit: a known type, or a class from the extra list (cemetery, triumphal arch, …)
      if (typ === 'sonstiges' && !anyHeadEnds(x.cls, c.sehenswert_woerter || [])) return null;
    }
    var s = computeScore({ sprachversionen: x.sl, laenge: 0, denkmal: x.h, unesco: x.u, typ: typ, quellen: [] }, cfg).score;
    // directory (v0.8 test): language versions weighted differently, plus Wikipedia page views per day
    if (c.gewicht_sprachen != null) s += (c.gewicht_sprachen - (cfg.score.gewichte.sprachversionen || 0)) * log10p(x.sl);
    if (c.gewicht_aufrufe) s += c.gewicht_aufrufe * log10p(x.pv);
    if (x.wv && c.bonus_wikivoyage_ort) s += c.bonus_wikivoyage_ort;
    var pd = profileDelta(x, typ, cfg);
    s += pd.d;
    s = round1(s);
    // nature (mountains, lakes, glaciers …) never counts for a city: big mountain municipalities would collect dozens of peaks
    var natur = typ === 'natur' || anyHeadEnds(x.cls, c.natur_woerter || []);
    return s > 0 ? { score: s, typ: typ, natur: natur, av: pd.av || undefined } : null;
  }

  function gridIndex(list, cell) {
    var g = {};
    list.forEach(function (x) {
      var k = Math.floor(x.lat / cell) + ',' + Math.floor(x.lon / cell);
      (g[k] = g[k] || []).push(x);
    });
    return function (lat, lon) {
      var a = Math.floor(lat / cell), b = Math.floor(lon / cell), out = [];
      for (var i = a - 1; i <= a + 1; i++) for (var j = b - 1; j <= b + 1; j++) { var l = g[i + ',' + j]; if (l) out = out.concat(l); }
      return out;
    };
  }

  /**
   * Stars of a city (object from computeCities, or a bare score): from the sum, or from its best sight
   * if that is higher (Versailles has one world-famous palace, not ten good sights).
   */
  /** Stars of an excursion outside cities (from its points). */
  function ortStars(score, cfg) {
    var th = cfg.staedte.ausflug_sterne || {};
    return score >= (th['3'] || 9) ? 3 : score >= (th['2'] || 7.5) ? 2 : 1;
  }
  function cityStars(c, cfg) {
    var th = cfg.staedte.schwellen, eth = cfg.staedte.einzel_schwellen || {};
    var score = typeof c === 'number' ? c : c.score;
    var s = score >= th['3'] ? 3 : score >= th['2'] ? 2 : score >= th['1'] ? 1 : 0;
    var best = typeof c === 'object' && c.top && c.top[0] ? c.top[0][3] : 0;
    var e = best >= (eth['3'] || 99) ? 3 : best >= (eth['2'] || 99) ? 2 : best >= (eth['1'] || 99) ? 1 : 0;
    return Math.max(s, e);
  }

  /** One marker per city: candidates inside the radius of a bigger one are merged into it. */
  function mergeCityCands(cands, cfg, sights) {
    var cell = 0.2, merge = cfg.staedte.zusammen_faktor || 0.5;
    cands.sort(function (a, b) { return (b.pop - a.pop) || (b.sl - a.sl); });
    var kept = [], keptGrid = {};
    cands.forEach(function (x) {
      x.r = cityRadius(x.pop, cfg, x.km2);
      var a = Math.floor(x.lat / cell), b = Math.floor(x.lon / cell), inside = false;
      for (var i = a - 1; i <= a + 1 && !inside; i++) for (var j = b - 1; j <= b + 1 && !inside; j++) {
        (keptGrid[i + ',' + j] || []).forEach(function (k) { if (!inside && haversine(k.lat, k.lon, x.lat, x.lon) < k.r * merge) inside = k; });
      }
      if (inside) {
        // the better-known item names the marker (Lyon, not "Métropole de Lyon"); the bigger radius stays
        if (x.sl > inside.sl) {
          x.fate = 'zusammengelegt, ersetzt ' + inside.name;
          ['name', 'name_en', 'q', 'lat', 'lon', 'sl', 'land'].forEach(function (f) { inside[f] = x[f]; });
          inside.u = inside.u || x.u; inside.cap = inside.cap || x.cap;
        } else x.fate = 'zusammengelegt mit ' + inside.name;
        // a "fortified town" without inhabitants (Cité de Carcassonne) is a sight of the city it lies in
        var ss = !x.pop && (x._s !== undefined ? x._s : sightScore(x, cfg));
        if (ss) { x.fate += ', zählt als Sehenswürdigkeit'; sights.push({ x: x, score: ss.score, typ: ss.typ, natur: ss.natur }); }
        return;
      }
      x.fate = 'Stadt, Radius ' + Math.round(x.r) + ' m';
      x.sights = [];
      kept.push(x);
      var key = a + ',' + b;
      (keptGrid[key] = keptGrid[key] || []).push(x);
    });
    return kept;
  }

  /**
   * Cities and big sights of one country from the loaded items.
   * land: {code, qid, bbox}. Returns {staedte: [...], orte: [...], stats}.
   * Stars are computed again in the app from `score` (thresholds in config), so they can be tuned without recomputing.
   */
  function computeCities(items, cfg, land) {
    var c = cfg.staedte, cell = 0.2;
    var cands = [], sights = [];
    items.forEach(function (x) {
      if (isCityItem(x, cfg)) { if (isUnesco(x, cfg)) x.u = true; cands.push(x); }
      else {
        var s = sightScore(x, cfg);
        if (s) sights.push({ x: x, score: s.score, typ: s.typ, natur: s.natur });
        else x.fate = 'zählt nicht';
      }
    });
    var kept = mergeCityCands(cands, cfg, sights);
    var near = gridIndex(kept, cell);
    var outside = [];
    sights.forEach(function (s) {
      var best = null, bestQ = Infinity;
      if (s.natur) { s.x.fate = 'Natur ' + s.score; outside.push(s); return; }
      near(s.x.lat, s.x.lon).forEach(function (k) {
        var d = haversine(k.lat, k.lon, s.x.lat, s.x.lon);
        if (d < k.r && d / k.r < bestQ) { bestQ = d / k.r; best = k; }
      });
      s.x.fate = (best ? 'zu ' + best.name : 'außerhalb') + ' ' + s.score + ' (' + s.typ + ')';
      if (best) best.sights.push(s); else outside.push(s);
    });
    var inLand = function (x) {
      return x.land.length ? x.land.indexOf(land.qid) >= 0 : inBbox(x, land.bbox);
    };
    var topN = c.top_n || 10, bonus = c.bonus || {}, minScore = c.min_score_datei || 0;
    var staedte = [];
    kept.forEach(function (k) {
      if (!inLand(k) || !k.sights.length) return;
      k.sights.sort(function (a, b) { return b.score - a.score; });
      var sum = 0;
      k.sights.slice(0, topN).forEach(function (s) { sum += s.score; });
      var unesco = k.u || k.sights.some(function (s) { return s.x.u; });
      if (unesco) sum += bonus.unesco || 0;
      // how well-known the city itself is (language versions), so that Bamberg or York with few famous single
      // buildings are not below an industrial city; only for cities that have at least two sights
      if (k.sights.length >= 2) sum += (bonus.sprachversionen_faktor || 0) * k.sl;
      if (k.cap) sum += bonus.hauptstadt || 0;
      if (k.wv) sum += bonus.wikivoyage || 0;
      if (k.pv && bonus.aufrufe_faktor) sum += bonus.aufrufe_faktor * log10p(k.pv);
      sum = round1(sum);
      if (sum < minScore) return;
      staedte.push({
        name: k.name, q: k.q, lat: +k.lat.toFixed(4), lon: +k.lon.toFixed(4), score: sum, pop: k.pop, sl: k.sl, pv: k.pv, wv: k.wv || undefined,
        n: k.sights.length, unesco: unesco || undefined,
        top: k.sights.slice(0, 3).map(function (s) { return [s.x.name, +s.x.lat.toFixed(4), +s.x.lon.toFixed(4), s.score]; })
      });
    });
    staedte.sort(function (a, b) { return b.score - a.score; });
    var orte = outside.filter(function (s) { return s.score >= (c.ausflug_ab || 9) && inLand(s.x); }).map(function (s) {
      return { name: s.x.name, q: s.x.q, lat: +s.x.lat.toFixed(4), lon: +s.x.lon.toFixed(4), score: s.score, typ: s.typ, unesco: s.x.u || undefined };
    }).sort(function (a, b) { return b.score - a.score; });
    return {
      staedte: staedte, orte: orte,
      stats: { items: items.length, kandidaten: cands.length, staedte_gesamt: kept.length, orte_gesamt: sights.length, ausserhalb: outside.length }
    };
  }

  /**
   * Average Wikipedia page views per day (last `tage` days, all languages in x.titel added up) → x.pv.
   * MediaWiki returns up to 50 titles per request (prop=pageviews), so 1000 places are about 20–60 requests.
   */
  function loadPageviews(items, cfg, f, o) {
    o = o || {};
    var c = cfg.staedte, days = c.aufrufe_tage || 30, jobs = [], byTitle = {};
    (c.titel_sprachen || []).forEach(function (l) {
      var titles = [];
      items.forEach(function (x) {
        var t = x.titel && x.titel[l];
        if (!t) return;
        var key = l + ':' + t;
        (byTitle[key] = byTitle[key] || []).push(x);
        if (byTitle[key].length === 1) titles.push(t);
      });
      var n = c.aufrufe_stapel || 50;
      for (var i = 0; i < titles.length; i += n) jobs.push({ l: l, titles: titles.slice(i, i + n) });
    });
    items.forEach(function (x) { x.pv = 0; });
    var done = 0, failed = 0, errors = {}, t0 = Date.now();
    function one(job) {
      var sum = {}, norm = {};
      function req(cont) {
        var url = 'https://' + job.l + '.wikipedia.org/w/api.php?' + qs(Object.assign({
          action: 'query', format: 'json', formatversion: 2, prop: 'pageviews', pvipdays: days, origin: '*', titles: job.titles.join('|')
        }, cont || {}));
        return getJsonRetry(url, f, [2000, 5000, 10000], (c.aufrufe_timeout_s || 40) * 1000).then(function (d) {
          var q = d.query || {};
          (q.normalized || []).forEach(function (n) { norm[n.to] = n.from; });
          (q.pages || []).forEach(function (pg) {
            var n = 0;
            Object.keys(pg.pageviews || {}).forEach(function (k) { n += pg.pageviews[k] || 0; });
            sum[pg.title] = (sum[pg.title] || 0) + n;
            if (norm[pg.title]) sum[norm[pg.title]] = (sum[norm[pg.title]] || 0) + n;
          });
          if (d.continue) return req(d.continue);
        });
      }
      return req().then(function () {
        Object.keys(sum).forEach(function (t) { (byTitle[job.l + ':' + t] || []).forEach(function (x) { x.pv += sum[t] / days; }); });
      }, function (e) { failed++; var k = (e && e.message) || '?'; errors[k] = (errors[k] || 0) + 1; })
        .then(function () { done++; if (o.onProgress) o.onProgress(done, jobs.length); });
    }
    return runLimited(jobs, c.aufrufe_parallel || 4, one).then(function () {
      items.forEach(function (x) { x.pv = Math.round(x.pv * 10) / 10; });
      return { requests: jobs.length, failed: failed, errors: errors, ms: Date.now() - t0 };
    });
  }

  /**
   * Article titles (x.titel) and Wikivoyage flag (x.wv) for a few items, from Wikidata wbgetentities (50 per request).
   * Much lighter than asking for them in the tile query.
   */
  function loadSitelinks(items, cfg, f, o) {
    o = o || {};
    var c = cfg.staedte, langs = c.titel_sprachen || ['de', 'en'], sites = langs.map(function (l) { return l + 'wiki'; });
    var wvs = c.wikivoyage ? langs.map(function (l) { return l + 'wikivoyage'; }) : [];
    var byQ = {}, ids = [];
    items.forEach(function (x) { if (!byQ[x.q]) { byQ[x.q] = []; ids.push(x.q); } byQ[x.q].push(x); });
    var jobs = [];
    for (var i = 0; i < ids.length; i += 50) jobs.push(ids.slice(i, i + 50));
    var failed = 0, t0 = Date.now();
    return runLimited(jobs, 2, function (batch) {
      var url = 'https://www.wikidata.org/w/api.php?' + qs({
        action: 'wbgetentities', format: 'json', origin: '*', props: 'sitelinks', sitefilter: sites.concat(wvs).join('|'), ids: batch.join('|')
      });
      return getJsonRetry(url, f, [2000, 5000], 40000).then(function (d) {
        Object.keys(d.entities || {}).forEach(function (q) {
          var sl = d.entities[q].sitelinks || {};
          (byQ[q] || []).forEach(function (x) {
            x.titel = {};
            langs.forEach(function (l) { if (sl[l + 'wiki']) x.titel[l] = sl[l + 'wiki'].title; });
            x.wv = wvs.some(function (k) { return !!sl[k]; });
          });
        });
      }, function () { failed++; });
    }).then(function () { return { requests: jobs.length, failed: failed, ms: Date.now() - t0 }; });
  }

  // a long word in common ("hermitage"), apart from generic ones ("museum"): two entries a few metres apart are then one place
  function shareWord(a, b, stop) {
    var wa = norm(a).split(' ').filter(function (w) { return w.length >= 7 && (stop || []).indexOf(w) < 0; });
    return norm(b).split(' ').some(function (w) { return wa.indexOf(w) >= 0; });
  }

  function sameNameKey(name) {
    return norm(String(name || '').replace(/\([^)]*\)/g, ' ')).replace(/^ (the|le|la|les|l|il|der|die|das) /, ' ');
  }
  function starsFrom(score, th) {
    return score >= th['3'] ? 3 : score >= th['2'] ? 2 : score >= th['1'] ? 1 : 0;
  }

  /** Items worth asking page views for: the best sights and the best-known places (before page views are known). */
  function directoryCandidates(items, cfg, lim) {
    var v = Object.assign({}, cfg.verzeichnis, lim || {}), sights = [], nature = [], places = [], s0 = [];
    items.forEach(function (x) {
      if (isCityItem(x, cfg)) { if (x.pop >= (v.min_einwohner || 0)) places.push(x); return; }
      var s = sightScore(x, cfg);
      // excursions (nature, leisure parks) always: Fort Fun has few language versions, but many readers
      if (s && (s.natur || (v.ausflug_typen || []).indexOf(s.typ) >= 0)) nature.push({ x: x, s: s.score });
      else if (s && s.score >= (v.aufrufe_ab || 0)) sights.push({ x: x, s: s.score });
      else if (s) s0.push({ x: x, s: s.score });
    });
    var by = function (a, b) { return b.s - a.s; };
    sights.sort(by); nature.sort(by);
    places.sort(function (a, b) { return b.sl - a.sl; });
    var pick = function (l, n) { return l.slice(0, n).map(function (o) { return o.x; }); };
    var n = v.aufrufe_orte || 250, out = pick(sights, n);
    // v0.8.4: everything known in many languages too, even with few points (ZKM: 13 languages, 4,8 points)
    var known = sights.slice(n).concat(s0).filter(function (o) { return o.x.sl >= (v.aufrufe_ab_sprachen || 1e9) && out.indexOf(o.x) < 0; }).map(function (o) { return o.x; });
    return out.concat(known, pick(nature, v.aufrufe_natur || 60), places.slice(0, v.aufrufe_staedte || 150));
  }

  /**
   * Directory of a region like a printed guide: every sight with points and stars, every town with stars,
   * and for each marker the zoom from which it is shown (z):
   *   ★★★ sights and ★★/★★★ towns everywhere; ★★ sights, ★ towns and ★ sights outside starred towns from `zoom.region`;
   *   all other sights with at least `nah_ab` points from `zoom.nah`.
   * Sights shown on their own (★★ and more) count only partly for their town, so that a village is not
   * starred just because a famous castle lies in it (it gets its own marker instead).
   */
  function computeDirectory(items, cfg, land, opt) {
    // the app keeps the tile items and computes again and again: work on copies (merging changes names and positions)
    if (opt && opt.copy) items = items.map(function (x) { return Object.assign({}, x); });
    var v = cfg.verzeichnis, c = cfg.staedte, cell = 0.2, zr = (v.zoom && v.zoom.region) || 9, zn = (v.zoom && v.zoom.nah) || 12;
    var cands = [], sights = [];
    items.forEach(function (x) {
      // items of a stored tile carry their kind (_c) and points (_s) already (prepareDirectoryTile)
      var isC = x._c !== undefined ? x._c : isCityItem(x, cfg) && x.pop >= (v.min_einwohner || 0);
      if (isC) { if (x._c === undefined && isUnesco(x, cfg)) x.u = true; cands.push(x); x.sights = []; return; }
      var s = x._s !== undefined ? x._s : sightScore(x, cfg);
      if (s) sights.push({ x: x, score: s.score, typ: s.typ, natur: s.natur });
      else x.fate = isCityItem(x, cfg) ? 'kleiner Ort (' + x.pop + ' Einw.)' : 'zählt nicht';
    });
    // the same place twice (building and collection, "Musée Ariana" in two items): keep the better one
    sights.sort(function (a, b) { return b.score - a.score; });
    var seen = {}, uniq = [], twinGrid = {}, TC = 0.002; // twinGrid: cells of 0.002° (about 140 m or more), so that the near-twin check looks at 9 cells, not at all sights (v0.20.0: was quadratic)
    sights.forEach(function (s) {
      var k = sameNameKey(s.x.name), dup = (seen[k] || []).filter(function (o) { return haversine(o.x.lat, o.x.lon, s.x.lat, s.x.lon) < (v.doppelt_m || 500); })[0];
      var ci = Math.floor(s.x.lat / TC), cj = Math.floor(s.x.lon / TC);
      if (!dup && v.doppelt_nah_m) {
        for (var i = ci - 1; i <= ci + 1 && !dup; i++) for (var j = cj - 1; j <= cj + 1 && !dup; j++) {
          dup = (twinGrid[i + ',' + j] || []).filter(function (o) { return haversine(o.x.lat, o.x.lon, s.x.lat, s.x.lon) < v.doppelt_nah_m && shareWord(o.x.name, s.x.name, v.doppelt_ignorieren); })[0];
        }
      }
      if (dup) { s.x.fate = 'doppelt zu ' + dup.x.name; return; }
      (seen[k] = seen[k] || []).push(s);
      (twinGrid[ci + ',' + cj] = twinGrid[ci + ',' + cj] || []).push(s);
      uniq.push(s);
    });
    sights = uniq;
    var kept = mergeCityCands(cands, cfg, sights);
    var near = gridIndex(kept, cell);
    sights.forEach(function (s) {
      var ausflug = s.natur || (v.ausflug_typen || []).indexOf(s.typ) >= 0;
      s.st = starsFrom(s.score, ausflug && v.sterne_natur ? v.sterne_natur : v.sterne);
      s.alone = s.st >= 2;
      if (s.natur) { s.x.fate = 'Natur ' + s.score; return; }
      var best = null, bestQ = Infinity;
      near(s.x.lat, s.x.lon).forEach(function (k) {
        var d = haversine(k.lat, k.lon, s.x.lat, s.x.lon);
        if (d < k.r && d / k.r < bestQ) { bestQ = d / k.r; best = k; }
      });
      s.city = best;
      s.x.fate = (best ? 'zu ' + best.name : 'außerhalb') + ' ' + s.score + ' (' + s.typ + ')';
      if (best) best.sights.push(s);
    });
    var inLand = function (x) { return !land || (x.land.length ? x.land.indexOf(land.qid) >= 0 : inBbox(x, land.bbox)); };
    var g = v.stadt || {}, staedte = [];
    kept.forEach(function (k) {
      k.sights.sort(function (a, b) { return b.score - a.score; });
      // how well-known the town is, plus what there is to see (only the part above `basis` points counts)
      var fame = (g.sprachen || 0) * log10p(k.sl) + (g.aufrufe || 0) * log10p(k.pv) + (k.wv ? g.wikivoyage || 0 : 0) + (k.cap ? g.hauptstadt || 0 : 0);
      var see = 0;
      k.sights.slice(0, g.top_n || 5).forEach(function (s) { see += Math.max(0, s.score - (g.basis || 5)) * (s.alone ? (g.einzel_anteil != null ? g.einzel_anteil : 1) : 1); });
      var sum = round1(fame + see);
      // a star only if there is something to see (Thonon is well-known, but has hardly any sights)
      k.st = see >= (g.min_sehen || 0) ? starsFrom(sum, v.stadt_sterne) : 0;
      k.score = sum;
      if (!inLand(k) || (!k.sights.length && !k.st)) return;
      staedte.push({
        name: k.name, q: k.q, lat: +k.lat.toFixed(4), lon: +k.lon.toFixed(4), score: sum, st: k.st, z: k.st >= 2 ? 0 : k.st ? zr : zn,
        pop: k.pop, sl: k.sl, pv: k.pv, wv: k.wv || undefined, n: k.sights.length, bekannt: round1(fame), sehen: round1(see),
        top: k.sights.slice(0, 3).map(function (s) { return [s.x.name, +s.x.lat.toFixed(4), +s.x.lon.toFixed(4), s.score]; })
      });
    });
    staedte.sort(function (a, b) { return b.score - a.score; });
    // v0.9.3: below nah_ab points only when zoomed in very close (zoom.alle): then everything with an article
    var za = (v.zoom && v.zoom.alle) || 15;
    var orte = sights.filter(function (s) { return inLand(s.x); }).map(function (s) {
      var inStar = s.city && s.city.st > 0, low = s.score < (v.nah_ab || 0) || (s.st < 2 && isDescriptiveName(s.x.name));
      var z = low ? za : s.st >= 3 ? 0 : s.st === 2 ? zr : s.st === 1 && !inStar ? zr : zn;
      return { name: s.x.name, q: s.x.q, lat: +s.x.lat.toFixed(4), lon: +s.x.lon.toFixed(4), score: s.score, st: s.st, z: z, typ: s.typ,
        natur: s.natur || undefined, unesco: s.x.u || undefined, stadt: s.city ? s.city.name : undefined, low: low || undefined };
    });
    return { staedte: staedte, orte: orte, stats: { items: items.length, kandidaten: cands.length, staedte_gesamt: kept.length, orte_gesamt: sights.length } };
  }

  /** Settings for the directory: the tile query and the scores use cfg.staedte with the overrides of cfg.verzeichnis.abfrage. */
  function directoryConfig(cfg) {
    var d = JSON.parse(JSON.stringify(cfg));
    Object.assign(d.staedte, (cfg.verzeichnis && cfg.verzeichnis.abfrage) || {});
    return d;
  }

  /**
   * One tile of the directory, as the phone stores it: Wikidata items of the tile, page views and Wikivoyage for
   * the best candidates, then only what counts (towns from min_einwohner, sights with points), each with its
   * kind (_c) and points (_s), so that computeDirectory over many tiles is quick.
   * dcfg = directoryConfig(cfg). Returns {t, stand, items, roh, ms, abfragen, fehler}.
   */
  function prepareDirectoryTile(t, dcfg, f, o) {
    o = o || {};
    var v = dcfg.verzeichnis, t0 = Date.now();
    return loadCityTiles([t], dcfg, f, { control: o.control }).then(function (r) {
      if (r.failed.length) { var e = new Error('Wikidata: Kachel nicht geladen'); e.failed = r.failed; throw e; }
      var cands = directoryCandidates(r.items, dcfg, v.kachel_aufrufe);
      return loadSitelinks(cands, dcfg, f).then(function () { return loadPageviews(cands, dcfg, f, {}); }).then(function (pv) {
        var keep = [];
        r.items.forEach(function (x) {
          var isC = isCityItem(x, dcfg) && x.pop >= (v.min_einwohner || 0);
          var s = isC ? null : sightScore(x, dcfg);
          if (!isC && !s) return;
          keep.push({
            q: x.q, name: x.name, lat: x.lat, lon: x.lon, sl: x.sl, pop: x.pop || 0, km2: x.km2 || 0, land: x.land.slice(0, 1),
            u: isUnesco(x, dcfg) || undefined, cap: x.cap || undefined, pv: x.pv || undefined, wv: x.wv || undefined,
            _c: isC, _s: s ? { score: s.score, typ: s.typ, natur: s.natur || undefined, av: s.av } : null
          });
        });
        return { t: tileKey(t), stand: Date.now(), items: keep, roh: r.items.length, ms: Date.now() - t0, abfragen: r.queries + pv.requests, fehler: pv.failed };
      });
    });
  }

  /** Tiles of the directory grid that cover a map section. */
  function directoryTiles(b, cfg) { return cityTiles(b, (cfg.verzeichnis && cfg.verzeichnis.kachel) || 0.25); }

  // ------------------------------------------------------- route corridor (v0.9, PROJEKT.md 6b)
  // The line is the straight line (great circle, approximated per segment) between start, via points and destination.
  // A place is shown if its distance to the line is at most the width for its stars and means of transport.

  /** Distance of p to the polyline pts (km) and position along it (km from start). Local flat projection per segment. */
  function lineDistance(p, pts) {
    var best = { d: Infinity, along: 0 }, run = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], k = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
      var bx = (b.lon - a.lon) * k * 111.32, by = (b.lat - a.lat) * 110.57;
      var px = (p.lon - a.lon) * k * 111.32, py = (p.lat - a.lat) * 110.57;
      var len2 = bx * bx + by * by, t0 = len2 ? (px * bx + py * by) / len2 : 0, t = Math.max(0, Math.min(1, t0));
      var dx = px - t * bx, dy = py - t * by, d = Math.sqrt(dx * dx + dy * dy), len = Math.sqrt(len2);
      // beyond: before the start or after the destination (not between them)
      if (d < best.d) best = { d: d, along: run + t * len, beyond: (i === 0 && t0 < 0) || (i === pts.length - 2 && t0 > 1) };
      run += len;
    }
    best.total = run;
    return best;
  }
  /** Length of the polyline in km. */
  function lineLength(pts) { return lineDistance(pts[0], pts).total; }
  /** Widths (km) for the means of transport, by stars 3..0; monotone (fewer stars never wider). */
  function corridorWidths(mode, cfg) {
    var w = ((cfg.korridor && cfg.korridor.breite_km) || {})[mode] || { 3: 40, 2: 15, 1: 5, 0: 2 };
    var out = {}, prev = Infinity;
    [3, 2, 1, 0].forEach(function (s) { prev = Math.min(prev, +w[s] || 0); out[s] = prev; });
    return out;
  }
  /** Directory tiles along the line: samples every probe_km, each with a box of the largest width around it. */
  function corridorTiles(pts, mode, cfg, deg) {
    var w = corridorWidths(mode, cfg)[3], step = (cfg.korridor && cfg.korridor.probe_km) || 10, seen = {}, out = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], len = lineLength([a, b]), n = Math.max(1, Math.ceil(len / step));
      for (var j = 0; j <= n; j++) {
        var lat = a.lat + (b.lat - a.lat) * j / n, lon = a.lon + (b.lon - a.lon) * j / n;
        var dLat = w / 110.57, dLon = w / (111.32 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
        var bx = { south: lat - dLat, north: lat + dLat, west: lon - dLon, east: lon + dLon };
        (deg ? cityTiles(bx, deg) : directoryTiles(bx, cfg)).forEach(function (t) {
          var k = tileKey(t);
          if (!seen[k]) { seen[k] = 1; out.push(t); }
        });
      }
    }
    return out;
  }
  /**
   * What lies along the route: towns with stars and sights of the directory result within the width of their stars.
   * Returns [{k: 'c'|'o', x, s, d (km to the line), along (km from start), umweg (km, there and back)}] in order along the route.
   */
  function corridorPick(res, pts, mode, cfg, plan) {
    var w = corridorWidths(mode, cfg), out = [], min = plan ? plan.minStars : 0;
    var take = function (k, x) {
      var s = x.st || 0;
      if ((k === 'c' && !s) || s < min || x.low) return; // v0.9.3: the small ones of zoom.alle are no stops
      var r = lineDistance(x, pts);
      // v0.9.1: behind the start or past the destination only within the width of one star less (Chillon is not on the way from Morges to Lyon)
      if (r.d <= (r.beyond ? w[Math.max(0, s - 1)] : w[s])) out.push({ k: k, x: x, s: s, d: round1(r.d), along: round1(r.along), umweg: round1(2 * r.d) });
    };
    (res && res.staedte || []).forEach(function (x) { take('c', x); });
    (res && res.orte || []).forEach(function (x) { take('o', x); });
    // v0.9.2: one stop per town – the town stands for its sights (Genf, not Genf + four of its museums);
    // of a town without a stop only its best sight
    if (plan) {
      var towns = {}, best = {};
      out.forEach(function (it) { if (it.k === 'c') towns[it.x.name] = 1; });
      out.sort(function (a, b) { return (b.s - a.s) || ((b.x.score || 0) - (a.x.score || 0)); });
      out = out.filter(function (it) {
        if (it.k === 'c' || !it.x.stadt) return true;
        if (towns[it.x.stadt] || best[it.x.stadt]) return false;
        best[it.x.stadt] = 1; return true;
      });
    }
    // only as many stops as fit the travel time – the best ones (stars, then points)
    if (plan && out.length > plan.maxStops) {
      out = out.sort(function (a, b) { return (b.s - a.s) || ((b.x.score || 0) - (a.x.score || 0)); }).slice(0, plan.maxStops);
    }
    return out.sort(function (a, b) { return a.along - b.along; });
  }

  /**
   * v0.9.2: what a route shows depends on its travel time (straight line / speed of the means of transport):
   * short ones from ★, longer ones only ★★/★★★, and about halte_pro_stunde stops per hour (at most max_halte).
   * The tiles are big and the query light (only entries with min_sprachen language versions for these stars).
   * Returns {km, hours, minStars, maxStops, minSl, deg, tiles, rcfg}.
   */
  function routePlan(pts, mode, cfg) {
    var k = cfg.korridor || {}, km = lineLength(pts), kmh = (k.kmh || {})[mode] || 80, hours = km / kmh;
    var steps = k.sterne_ab || [{ bis_h: 1, sterne: 1 }, { bis_h: 3, sterne: 2 }, { sterne: 3 }];
    var minStars = steps.filter(function (st) { return st.bis_h == null || hours <= st.bis_h; })[0].sterne;
    var maxStops = Math.max(k.min_halte || 3, Math.min(k.max_halte || 15, Math.ceil(hours * (k.halte_pro_stunde || 2))));
    var minSl = (k.min_sprachen || { 1: 4, 2: 7, 3: 12 })[minStars] || 1;
    var deg = ((k.kachel_grad || {})[minStars]) || k.kachel || 0.5; // longer routes: fewer, bigger tiles (the query is lighter there)
    var rcfg = directoryConfig(cfg);
    rcfg.staedte.min_sprachversionen = minSl;
    return { km: round1(km), hours: Math.round(hours * 10) / 10, minStars: minStars, maxStops: maxStops, minSl: minSl, deg: deg,
      tiles: corridorTiles(pts, mode, cfg, deg), rcfg: rcfg };
  }

  /** Whole country: tiles over its bounding box, load, compute. */
  function loadCountryCities(land, cfg, f, o) {
    var tiles = cityTiles(bboxOf(land.bbox), cfg.staedte.kachel_grad || 1);
    return loadCityTiles(tiles, cfg, f, o).then(function (r) {
      var res = computeCities(r.items, cfg, { code: land.code, qid: land.qid, bbox: bboxOf(land.bbox) });
      res.land = land.code;
      res.version = CORE_VERSION;
      res.stand = Date.now();
      res.stats.kacheln = r.tiles; res.stats.abfragen = r.queries; res.stats.geteilt = r.splits;
      res.stats.fehler = r.failed.length; res.stats.ms = r.ms;
      res.fehler = r.failed;
      return res;
    });
  }
  function bboxOf(a) { return Array.isArray(a) ? { south: a[0], west: a[1], north: a[2], east: a[3] } : a; }

  function cityWikiUrl(q) { return 'https://www.wikidata.org/wiki/Special:GoToLinkedPage/dewiki/' + encodeURIComponent(q); }

  return {
    VERSION: CORE_VERSION,
    haversine: haversine, formatDistance: formatDistance, compareVersions: compareVersions,
    starsText: starsText, cleanTitle: cleanTitle, headPhrase: headPhrase,
    classify: classify, typeInfo: typeInfo, sitelinkCount: sitelinkCount,
    computeScore: computeScore, starsFor: starsFor,
    wikipediaQueryUrl: wikipediaQueryUrl, loadWikipedia: loadWikipedia, loadWikidata: loadWikidata,
    loadClassLabels: loadClassLabels, getJsonRetry: getJsonRetry,
    buildPlaces: buildPlaces, sortPlaces: sortPlaces, loadPlaces: loadPlaces,
    reverseGeocode: reverseGeocode, languagesFor: languagesFor, localLanguage: localLanguage,
    searchPlaces: searchPlaces, isLatin: isLatin, pickNames: pickNames,
    shortLabel: shortLabel, mapLabel: mapLabel, setOsmStatic: setOsmStatic, buildOsmPlace: buildOsmPlace, osmTypeOf: osmTypeOf, displayName: displayName, isDescriptiveName: isDescriptiveName, osmTileKeys: osmTileKeys, dropNationalPrefix: dropNationalPrefix, stripLocation: stripLocation, firstSentence: firstSentence,
    dropLocation: dropLocation, shortInfo: shortInfo, splitSentences: splitSentences,
    articleFor: articleFor, loadIntros: loadIntros, translate: translate,
    cleanArticle: cleanArticle, cutAtSentence: cutAtSentence, loadArticle: loadArticle,
    buildPrompt: buildPrompt, buildReviewPrompt: buildReviewPrompt, reviewGoogleUrl: reviewGoogleUrl, claudeNewUrl: claudeNewUrl,
    _setFetchTimeout: function (ms) { FETCH_TIMEOUT = ms; },
    tileKeys: tileKeys, overpassQuery: overpassQuery, compactOsm: compactOsm, loadOsm: loadOsm,
    nameSimilarity: nameSimilarity, mergeOsm: mergeOsm, osmFacts: osmFacts,
    _resetTranslators: function () { chromeTranslators = {}; myMemoryBlocked = false; },
    sameName: sameName, sourceCounts: sourceCounts, sourceTag: sourceTag,
    bboxSize: bboxSize, bboxCenter: bboxCenter, circleFor: circleFor, inBbox: inBbox, bboxContains: bboxContains,
    bboxOverlaps: bboxOverlaps, cellsFor: cellsFor, loadWikipediaArea: loadWikipediaArea, loadOsmArea: loadOsmArea,
    osmandWebUrl: osmandWebUrl, osmandGoUrl: osmandGoUrl, osmandIntentUrl: osmandIntentUrl,
    nameWithPlace: nameWithPlace, gmapsSearchUrl: gmapsSearchUrl, gmapsPinUrl: gmapsPinUrl,
    geoSearchUrl: geoSearchUrl, geoPinUrl: geoPinUrl, wikipediaUrl: wikipediaUrl, googleLinks: googleLinks, googleWhere: googleWhere, heightText: heightText, infoLine: infoLine,
    tripadvisorUrl: tripadvisorUrl, merkZeile: merkZeile,
    iconFor: iconFor, cityTiles: cityTiles, tileKey: tileKey, splitTile: splitTile, citySparql: citySparql, parseCityRows: parseCityRows,
    loadCityTiles: loadCityTiles, isCityItem: isCityItem, cityRadius: cityRadius, sightScore: sightScore,
    profileDelta: profileDelta, sectionList: sectionList, sectionRaw: sectionRaw, gegendTopics: gegendTopics, loadGegend: loadGegend, searchTopics: searchTopics, wikiTitleFor: wikiTitleFor, applyViewpoints: applyViewpoints, computeCities: computeCities, loadPageviews: loadPageviews, loadSitelinks: loadSitelinks, directoryCandidates: directoryCandidates, computeDirectory: computeDirectory, lineDistance: lineDistance, routePlan: routePlan, lineLength: lineLength, corridorWidths: corridorWidths, corridorTiles: corridorTiles, corridorPick: corridorPick, directoryConfig: directoryConfig, prepareDirectoryTile: prepareDirectoryTile, directoryTiles: directoryTiles, cityStars: cityStars, ortStars: ortStars, loadCountryCities: loadCountryCities, bboxOf: bboxOf, cityWikiUrl: cityWikiUrl
  };
});
