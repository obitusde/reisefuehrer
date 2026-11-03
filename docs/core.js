/*
 * Reiseführer – core logic (v0.2.2)
 * Shared by the app (index.html), the diagnostics page (diag.html) and Node tests.
 * No DOM access here. Network access only through the injected fetch function.
 */
(function (root, factory) {
  var core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else { root.RF = root.RF || {}; root.RF.core = core; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CORE_VERSION = '0.2.2';

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
    found.push(byQid);
    var heads = function (arr) { return (arr || []).filter(Boolean).map(headPhrase).filter(function (h) { return h.trim(); }); };
    found.push(matchPhrases(types, heads(classLabels), [endsWithWord]));
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

  function getJson(url, f) {
    return f(url, { headers: { 'Accept': 'application/json' } }).then(function (r) {
      if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return r.json();
    });
  }

  function qs(obj) {
    return Object.keys(obj).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]);
    }).join('&');
  }

  function isTransient(e) {
    return (e && (e.status === 429 || e.status >= 500)) || /busy|too many|try again|timeout/i.test((e && e.message) || '');
  }

  // Retries transient failures (Wikipedia "Search is currently too busy", HTTP 429/5xx)
  function getJsonRetry(url, f, delays) {
    delays = delays || [1500, 3000];
    var attempt = 0;
    function go() {
      return getJson(url, f).then(function (d) {
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

    var second = n.de && n.de.toLowerCase() !== first.toLowerCase() ? n.de : '';
    return { name: first, name2: second };
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

  /**
   * Full pipeline: Wikipedia (all languages) -> Wikidata items -> class labels -> places.
   * opts: {lat, lon, radius, cfg, fetch, wdCache, langs, localLang, onProgress(text), retryDelays}
   */
  function loadPlaces(opts) {
    var cfg = opts.cfg, f = opts.fetch, prog = opts.onProgress || function () {};
    var langs = opts.langs || cfg.wikipedia.sprachen || ['de', 'en'];
    var t0 = Date.now(), warnings = [], requests = 0;
    prog('Lade Wikipedia (' + langs.join(', ') + ') …');
    return Promise.all(langs.map(function (l) {
      return loadWikipedia(l, opts.lat, opts.lon, opts.radius, cfg, f, opts.retryDelays).catch(function (e) {
        warnings.push('Wikipedia ' + l + ': ' + e.message);
        return null;
      });
    })).then(function (lrs) {
      var ok = lrs.filter(Boolean);
      if (!ok.length) throw new Error('Wikipedia nicht erreichbar (' + warnings.join('; ') + ')');
      requests += ok.reduce(function (s, lr) { return s + lr.requests; }, 0);
      var ids = {};
      ok.forEach(function (lr) { lr.pages.forEach(function (pg) { if (pg.wikidata) ids[pg.wikidata] = 1; }); });
      var idList = Object.keys(ids);
      prog('Lade Wikidata (' + idList.length + ' Einträge) …');
      var labelLangs = ['de', 'en'];
      if (opts.localLang && labelLangs.indexOf(opts.localLang) < 0) labelLangs.push(opts.localLang);
      return loadWikidata(idList, cfg, f, opts.wdCache, function (d, n) {
        prog('Lade Wikidata ' + d + '/' + n + ' …');
      }, opts.retryDelays, labelLangs).then(function (wdr) {
        requests += wdr.requests;
        if (wdr.failedBatches) warnings.push('Wikidata: ' + wdr.failedBatches + ' Abfrage(n) fehlgeschlagen');
        var cls = {};
        Object.keys(wdr.info).forEach(function (k) { (wdr.info[k].p31 || []).forEach(function (q) { cls[q] = 1; }); });
        prog('Lade Wikidata-Klassen …');
        return loadClassLabels(Object.keys(cls), f, opts.wdCache, opts.retryDelays).then(function (cr) {
          requests += cr.requests;
          if (cr.failedBatches) warnings.push('Wikidata-Klassen: ' + cr.failedBatches + ' Abfrage(n) fehlgeschlagen');
          var places = sortPlaces(buildPlaces(ok, wdr.info, cr.info, cfg, { lat: opts.lat, lon: opts.lon }, opts.localLang || null));
          return {
            places: places,
            warnings: warnings,
            stats: {
              ms: Date.now() - t0,
              langs: langs.join(','),
              perLang: ok.map(function (lr) { return lr.lang + ':' + lr.pages.length; }).join(' '),
              requests: requests,
              wdCached: wdr.cached
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
        region: a['ISO3166-2-lvl4'] || ''
      };
    });
  }

  /** Search a place by name (Nominatim, only on explicit user action, no autocomplete). */
  function searchPlaces(q, f) {
    var url = 'https://nominatim.openstreetmap.org/search?' + qs({
      q: q, format: 'jsonv2', limit: 5, 'accept-language': 'de'
    });
    return getJson(url, f).then(function (list) {
      return (list || []).map(function (r) {
        var parts = String(r.display_name || '').split(', ');
        return {
          name: r.name || parts[0] || q,
          detail: parts.slice(1).filter(function (x, i, a) { return i < 3 || i === a.length - 1; }).join(', '),
          lat: parseFloat(r.lat), lon: parseFloat(r.lon),
          bbox: r.boundingbox ? r.boundingbox.map(parseFloat) : null // [south, north, west, east]
        };
      }).filter(function (r) { return !isNaN(r.lat) && !isNaN(r.lon); });
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
    loadClassLabels: loadClassLabels, getJsonRetry: getJsonRetry,
    buildPlaces: buildPlaces, sortPlaces: sortPlaces, loadPlaces: loadPlaces,
    reverseGeocode: reverseGeocode, languagesFor: languagesFor, localLanguage: localLanguage,
    searchPlaces: searchPlaces, isLatin: isLatin, pickNames: pickNames,
    nameWithPlace: nameWithPlace, gmapsSearchUrl: gmapsSearchUrl, gmapsPinUrl: gmapsPinUrl,
    geoSearchUrl: geoSearchUrl, geoPinUrl: geoPinUrl, wikipediaUrl: wikipediaUrl,
    tripadvisorUrl: tripadvisorUrl, merkZeile: merkZeile
  };
});
