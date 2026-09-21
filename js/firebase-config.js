/* ============================================================
   Sulo Systems · Firebase configuration
   ------------------------------------------------------------
   Fill in the six values from the Firebase console:
     Project settings -> General -> Your apps -> Web app -> SDK setup

   THESE VALUES ARE MEANT TO BE PUBLIC. A Firebase web apiKey is not
   a secret and never was — it only identifies the project, and every
   visitor's browser has to receive it to talk to Firestore at all.
   Committing this file to a public GitHub Pages repo is expected and
   is not a leak. What actually protects the data is:

     1. Firestore security rules (see firebase/firestore.rules) —
        the public may CREATE a pageview and may read nothing.
     2. Firebase App Check — proves a request came from your real
        site rather than from curl. Strongly recommended before you
        rely on the numbers; see ANALYTICS-SETUP.md step 6.

   Anything that must stay secret (service account keys, admin SDK
   credentials) does NOT belong in this file or anywhere in a repo
   that GitHub Pages serves.
   ============================================================ */

export const firebaseConfig = {
  apiKey:            "AIzaSyBKptjTsxSu2TfrogkEne80ldrwBtdLnDM",
  authDomain:        "khubaib-analytics.firebaseapp.com",
  projectId:         "khubaib-analytics",
  storageBucket:     "khubaib-analytics.firebasestorage.app",
  messagingSenderId: "843831066117",
  appId:             "1:843831066117:web:0f7f6106c74dbccfab266c"
};

/* Who may open analytics.html and read the numbers. This list is
   only a convenience for the UI — the REAL gate is the identical
   list inside firestore.rules, which is enforced on Google's
   servers. Editing this array alone grants nobody anything; editing
   the rules alone is enough. Keep the two in sync. */
export const ADMIN_EMAILS = [
  "sulo@stempowering.ca",
  "sulosystems@gmail.com"
];

export const ANALYTICS = {
  /* Set false to switch the beacon off site-wide without redeploying
     every page. */
  enabled: true,

  /* Hostnames that must never be counted. Local development and the
     raw github.io mirror of a site served at its own domain would
     otherwise inflate every figure with your own visits. */
  ignoreHosts: ["localhost", "127.0.0.1", "0.0.0.0", ""],

  /* Country lookup. GitHub Pages is pure static hosting: there is no
     server of ours in the request path, so there is no
     cf-ipcountry / x-vercel-ip-country header to read and no way to
     see the visitor's IP from our own code. Country therefore has to
     come from a third party that CAN see the IP. geojs.io is free,
     needs no key, sets CORS headers and returns country, region and
     city.

     If this is set to null, or the request fails or is blocked (an
     ad blocker will often block it), the beacon still records the
     browser's own IANA timezone and language, which need no network
     call. "America/Toronto" is a perfectly usable answer to "where
     are they" and it is the more privacy-respecting signal of the
     two — so the dashboard shows both columns. */
  geoEndpoint: "https://get.geojs.io/v1/ip/geo.json",

  /* Raw per-view documents are what you would query for anything the
     dashboard does not already show. The rollup documents are what
     the dashboard actually reads — see the comment in
     js/sulo-analytics.js about why both exist. */
  writeRawPageviews: true,
  writeDailyRollups: true
};
