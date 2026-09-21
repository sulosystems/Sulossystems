/* ============================================================
   Sulo Systems · pageview beacon
   ------------------------------------------------------------
   Records one pageview to Cloud Firestore. Loaded as a module:

     <script type="module" src="js/sulo-analytics.js"></script>

   It is deliberately impossible for this file to break the page.
   Every path is wrapped, the Firebase SDK is imported dynamically
   so a blocked CDN cannot stop the rest of the page's scripts, and
   an unconfigured project exits before touching the network. If
   analytics fails, the site is simply not counted.

   WHY TWO WRITES PER VIEW
   The obvious design is one document per pageview and let the
   dashboard aggregate. That breaks on the free tier, not on write
   budget but on READS: Firestore bills a read per document, so a
   90-day dashboard over a site doing 500 views/day is 45,000 reads
   for ONE page load, against a 50,000/day free quota. Two reloads
   and you are locked out until midnight UTC.

   So each view also increments a single rollup document for its
   day, holding the day's total plus per-country, per-page and
   per-referrer maps. The dashboard reads 90 documents for a 90-day
   window instead of 45,000. Raw documents are still written (they
   are what you would query for anything the dashboard does not
   show, and Firestore's free tier allows 20,000 writes/day, so at
   two writes per view the ceiling is ~10,000 views/day) but nothing
   on the dashboard depends on reading them.

   WHAT IS NOT COLLECTED
   No IP address is stored. No cookies are set — the visitor id
   lives in localStorage, is a random string with nothing derived
   from the device, and is used only to tell a returning visitor
   from a new one. There is no cross-site anything.
   ============================================================ */

import { firebaseConfig, ANALYTICS } from "./firebase-config.js";

(async function () {
  "use strict";

  try {
    if (!ANALYTICS || ANALYTICS.enabled === false) return;

    /* --- bail-outs, cheapest first ------------------------------ */

    /* Unconfigured project: exit before any network call, so dropping
       these files into a repo does nothing at all until you paste the
       real config in. */
    if (!firebaseConfig || String(firebaseConfig.projectId || "").indexOf("PASTE") === 0) return;

    var host = location.hostname;
    if ((ANALYTICS.ignoreHosts || []).indexOf(host) !== -1) return;

    /* ?noanalytics=1 once, and this browser stops being counted for
       good — the way to keep your own team's visits out of the
       numbers. ?analytics=1 undoes it. */
    try {
      var qs = new URLSearchParams(location.search);
      if (qs.has("noanalytics")) localStorage.setItem("sulo_optout", "1");
      if (qs.has("analytics"))   localStorage.removeItem("sulo_optout");
      if (localStorage.getItem("sulo_optout") === "1") return;
    } catch (e) { /* private mode: carry on, just don't honour opt-out */ }

    /* Prerenders and background tabs are not visits. Chrome fires a
       prerender well before a human ever sees the page. */
    if (document.prerendering) return;
    if (document.visibilityState === "prerender") return;

    /* --- ids ---------------------------------------------------- */

    function rid() {
      try {
        var a = new Uint8Array(9);
        crypto.getRandomValues(a);
        return Array.prototype.map.call(a, function (b) {
          return ("0" + b.toString(16)).slice(-2);
        }).join("");
      } catch (e) {
        return String(Date.now()) + Math.random().toString(16).slice(2, 10);
      }
    }
    function stored(store, key) {
      try {
        var v = store.getItem(key);
        if (!v) { v = rid(); store.setItem(key, v); }
        return v;
      } catch (e) { return rid(); }   /* private mode: ephemeral id */
    }

    var visitorId = stored(localStorage, "sulo_vid");
    var sessionId = stored(sessionStorage, "sulo_sid");

    /* UTC day, so the rollup key does not shift with the viewer's
       timezone and a day's total cannot be split across two docs. */
    var now = new Date();
    var dayKey = now.toISOString().slice(0, 10);

    var isNewVisitor = false, isNewVisitorToday = false;
    try {
      isNewVisitor = !localStorage.getItem("sulo_seen");
      if (isNewVisitor) localStorage.setItem("sulo_seen", dayKey);
      isNewVisitorToday = localStorage.getItem("sulo_day") !== dayKey;
      if (isNewVisitorToday) localStorage.setItem("sulo_day", dayKey);
    } catch (e) { /* treat as returning rather than inflating uniques */ }

    /* --- where from --------------------------------------------- */

    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}

    /* One geo lookup per session, cached, so a visitor reading five
       pages costs one request rather than five. */
    async function geo() {
      if (!ANALYTICS.geoEndpoint) return null;
      try {
        var hit = sessionStorage.getItem("sulo_geo");
        if (hit) return JSON.parse(hit);
      } catch (e) {}
      try {
        var ctl = new AbortController();
        var t = setTimeout(function () { ctl.abort(); }, 2500);
        var res = await fetch(ANALYTICS.geoEndpoint, {
          signal: ctl.signal, cache: "no-store", credentials: "omit"
        });
        clearTimeout(t);
        if (!res.ok) return null;
        var j = await res.json();
        var out = {
          country:     String(j.country || "").slice(0, 60),
          countryCode: String(j.country_code || "").slice(0, 4).toUpperCase(),
          region:      String(j.region || "").slice(0, 60),
          city:        String(j.city || "").slice(0, 60)
        };
        /* Never keep j.ip — the whole point of not storing addresses. */
        try { sessionStorage.setItem("sulo_geo", JSON.stringify(out)); } catch (e) {}
        return out;
      } catch (e) {
        return null;   /* blocked, offline, or slower than 2.5s */
      }
    }

    /* --- referrer ----------------------------------------------- */

    var refHost = "direct";
    try {
      if (document.referrer) {
        var r = new URL(document.referrer);
        refHost = (r.hostname === location.hostname) ? "internal" : r.hostname;
      }
    } catch (e) {}

    var qsrc = "";
    try {
      var q = new URLSearchParams(location.search);
      qsrc = q.get("utm_source") || q.get("ref") || q.get("src") || "";
      qsrc = String(qsrc).slice(0, 60);
    } catch (e) {}

    /* Firestore map keys cannot contain "." or "/" and cannot be
       empty, so page paths and referrer hosts are flattened before
       they are used as keys in the rollup maps. The raw document
       keeps the untouched values. */
    function safeKey(v, fallback) {
      var s = String(v == null ? "" : v).trim().slice(0, 100);
      s = s.replace(/[.\/\[\]*`~$#]/g, "_");
      s = s.replace(/^__+|__+$/g, "");
      return s || fallback;
    }

    var path = location.pathname;
    /* Drop the extension BEFORE flattening, or "index43.html" becomes
       the key "index43_html" and the dashboard, which turns "_" back
       into "/", renders it as "/index43/html". Stripping it first
       gives "index43" -> "/index43", which is both correct and what
       anyone reading the table expects to see. */
    var pathKey = safeKey(
      path.replace(/^\/+|\/+$/g, "").replace(/\.html?$/i, "") || "index",
      "index"
    );
    var refKey  = safeKey(refHost, "direct");

    /* --- SDK (dynamic, so a blocked CDN cannot throw at parse) --- */

    var V = "10.12.2";
    var appMod, fsMod;
    try {
      appMod = await import("https://www.gstatic.com/firebasejs/" + V + "/firebase-app.js");
      fsMod  = await import("https://www.gstatic.com/firebasejs/" + V + "/firebase-firestore.js");
    } catch (e) {
      return;   /* offline, or blocked — nothing further to do */
    }

    var app = appMod.getApps && appMod.getApps().length
      ? appMod.getApp()
      : appMod.initializeApp(firebaseConfig);
    var db = fsMod.getFirestore(app);

    var g = await geo();

    var view = {
      ts:          fsMod.serverTimestamp(),   /* server clock, never the device's */
      day:         dayKey,
      path:        String(path).slice(0, 300),
      title:       String(document.title || "").slice(0, 200),
      referrer:    String(refHost).slice(0, 120),
      utmSource:   qsrc,
      country:     g ? g.country : "",
      countryCode: g ? g.countryCode : "",
      region:      g ? g.region : "",
      city:        g ? g.city : "",
      tz:          String(tz).slice(0, 60),
      lang:        String(navigator.language || "").slice(0, 20),
      screen:      (screen.width || 0) + "x" + (screen.height || 0),
      viewport:    (window.innerWidth || 0) + "x" + (window.innerHeight || 0),
      visitorId:   visitorId,
      sessionId:   sessionId,
      newVisitor:  !!isNewVisitor
    };

    var countryKey = safeKey(g && g.countryCode ? g.countryCode : "unknown", "unknown");
    var tzKey      = safeKey(tz || "unknown", "unknown");

    var jobs = [];

    if (ANALYTICS.writeRawPageviews !== false) {
      jobs.push(fsMod.addDoc(fsMod.collection(db, "pageviews"), view));
    }

    if (ANALYTICS.writeDailyRollups !== false) {
      var inc = fsMod.increment;
      var roll = {
        day:     dayKey,
        views:   inc(1),
        updated: fsMod.serverTimestamp()
      };
      /* merge:true creates the day's document on its first view and
         adds to it on every one after, so there is no "does today
         exist yet" round trip. */
      roll.countries = {}; roll.countries[countryKey] = inc(1);
      roll.pages     = {}; roll.pages[pathKey]        = inc(1);
      roll.referrers = {}; roll.referrers[refKey]     = inc(1);
      roll.zones     = {}; roll.zones[tzKey]          = inc(1);
      if (isNewVisitorToday) roll.uniques = inc(1);
      if (isNewVisitor)      roll.firstTimers = inc(1);

      jobs.push(fsMod.setDoc(fsMod.doc(db, "daily", dayKey), roll, { merge: true }));
    }

    await Promise.allSettled(jobs);
  } catch (e) {
    /* Analytics must never be the reason a page misbehaves. */
    if (window.console && console.debug) console.debug("[sulo-analytics]", e);
  }
})();
