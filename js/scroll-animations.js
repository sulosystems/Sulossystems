/* ============================================================
   Sulo Growth Systems — scroll entrance
   Motion language transcribed from levo-studio.com: one keyframe
   (rise 28px + blur 8px -> focus), the .22,.61,.36,1 easing, and a
   120ms stagger. No GSAP — Levo uses no animation library, and
   neither does this.

   Deliberate deviation: Levo reveals on page load because its page
   is short. This page has 14 sections, so the same motion is fired
   when a section enters view instead. Everything else is verbatim.
   ============================================================ */
(function () {
  "use strict";

  var STAGGER = 120;   // ms between siblings — Levo's exact interval
  var MAX_STAGGER = 8; // beyond ~8 the tail reads as lag

  function toArray(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canObserve = "IntersectionObserver" in window;

  /* ---------- Section + card entrances ---------- */
  var targets = toArray("[data-reveal]");

  if (targets.length && canObserve && !reduce) {
    // Arm only now: the hidden state is added by JS so that no-JS and
    // crawlers always get fully visible content.
    targets.forEach(function (el) { el.classList.add("is-armed"); });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;

        // Stagger against siblings that share a parent and enter together.
        var group = el.parentElement
          ? Array.prototype.filter.call(el.parentElement.children, function (c) {
              return c.hasAttribute && c.hasAttribute("data-reveal");
            })
          : [el];
        var i = group.indexOf(el);
        var delay = (i > -1 && group.length > 1) ? Math.min(i, MAX_STAGGER) * STAGGER : 0;

        window.setTimeout(function () {
          el.classList.remove("is-armed");
          el.classList.add("is-in");
        }, delay);

        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });

    targets.forEach(function (el) { io.observe(el); });
  }

  /* ---------- #where : step list drives the phone screen ---------- */
  var steps   = toArray(".where__step");
  var screens = toArray(".screen");
  var list    = document.querySelector(".where__steps");

  function setActive(index) {
    steps.forEach(function (s, i) {
      if (i === index) s.setAttribute("data-active", "true");
      else s.removeAttribute("data-active");
    });
    screens.forEach(function (s, i) {
      if (i === index) s.setAttribute("data-active", "true");
      else s.removeAttribute("data-active");
    });
  }

  function teardownWhere() {
    if (list) list.removeAttribute("data-enhanced");
    setActive(0);
  }

  var whereIO = null;

  function setupWhere() {
    if (!steps.length || !screens.length || !list) return;

    var desktop = window.matchMedia("(min-width: 1000px)").matches;

    if (whereIO) { whereIO.disconnect(); whereIO = null; }

    // Below the sticky breakpoint, or under reduced motion, every step stays
    // fully legible and the phone rests on screen 0.
    if (!desktop || reduce || !canObserve) { teardownWhere(); return; }

    list.setAttribute("data-enhanced", "true");
    setActive(0);

    whereIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var i = steps.indexOf(entry.target);
        if (i > -1) setActive(i);
      });
    }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });

    steps.forEach(function (s) { whereIO.observe(s); });
  }

  setupWhere();

  var resizeTimer;
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(setupWhere, 180);
  });
})();
