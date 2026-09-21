/* ============================================================
   Sulo Growth Systems — base interaction layer
   Nav, forms, work carousel. No scroll animation lives here;
   that belongs to js/scroll-animations.js.
   ============================================================ */
(function () {
  'use strict';

  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  /* ---------- NAV: glass firms up once content is behind it ---------- */
  var navEl = $('.nav');
  if (navEl) {
    var lastScrolled = null;
    function syncNav() {
      var v = (window.scrollY || window.pageYOffset) > 8;
      if (v !== lastScrolled) { lastScrolled = v; navEl.setAttribute('data-scrolled', String(v)); }
    }
    var navTick = false;
    window.addEventListener('scroll', function () {
      if (navTick) return; navTick = true;
      window.requestAnimationFrame(function () { syncNav(); navTick = false; });
    }, { passive: true });
    syncNav();
  }

  /* ---------- NAV: dark glass while overlapping a dark section ----------
     At authentic transparency, ink on glass over .where/.poster is 2.33:1. */
  (function () {
    var nav = $('.nav');
    if (!nav || !('IntersectionObserver' in window)) return;
    var darks = $$('.where, .poster');
    if (!darks.length) return;
    var over = 0;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { over += en.isIntersecting ? 1 : -1; });
      if (over < 0) over = 0;
      nav.setAttribute('data-over', over > 0 ? 'dark' : 'light');
    }, { rootMargin: '0px 0px -' + (window.innerHeight - 96) + 'px 0px', threshold: 0 });
    darks.forEach(function (d) { obs.observe(d); });
  })();

  /* ---------- NAV ---------- */
  var toggle = $('#nav-toggle');
  var drawer = $('#nav-drawer');

  if (toggle && drawer) {
    toggle.addEventListener('click', function () {
      var open = drawer.getAttribute('data-open') === 'true';
      drawer.setAttribute('data-open', String(!open));
      toggle.setAttribute('aria-expanded', String(!open));
      toggle.setAttribute('aria-label', open ? 'Open menu' : 'Close menu');
    });

    $$('a', drawer).forEach(function (a) {
      a.addEventListener('click', function () {
        drawer.setAttribute('data-open', 'false');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
      });
    });

    // Escape closes the drawer and returns focus to the trigger
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.getAttribute('data-open') === 'true') {
        drawer.setAttribute('data-open', 'false');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  /* ---------- NAV: current section ---------- */
  var navLinks = $$('.nav__links a');
  var targets = navLinks
    .map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); })
    .filter(Boolean);

  if (targets.length && 'IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.setAttribute('aria-current', a.getAttribute('href') === '#' + en.target.id ? 'true' : 'false');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    targets.forEach(function (t) { spy.observe(t); });
  }

  /* ---------- FORM VALIDATION ----------
     Validate on blur, never on keystroke. Errors sit below their
     field and are wired with aria-describedby in the markup. */

  function setError(input, msg) {
    var err = document.getElementById(input.getAttribute('aria-describedby'));
    if (err) err.textContent = msg || '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !msg;
  }

  function checkField(input) {
    var v = input.value.trim();
    if (!v) {
      return setError(input, labelOf(input) + ' is required.');
    }
    if (input.type === 'email' && !EMAIL.test(v)) {
      return setError(input, 'That email address is not complete — check for a typo.');
    }
    return setError(input, '');
  }

  function labelOf(input) {
    var l = document.querySelector('label[for="' + input.id + '"]');
    return l ? l.textContent.trim() : 'This field';
  }

  function wireBlur(form) {
    $$('.input', form).forEach(function (input) {
      input.addEventListener('blur', function () {
        // Only surface an error once the user has actually entered something
        // and left, or left a required field they had already touched.
        if (input.value.trim() !== '' || input.getAttribute('aria-invalid') === 'true') {
          checkField(input);
        }
      });
    });
  }

  /* ---------- HERO EMAIL GATE ---------- */
  var gate = $('#gate');
  var gateForm = $('#gate-form');

  if (gate && gateForm) {
    wireBlur(gateForm);

    gateForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('#gate-email');
      var expanded = gate.getAttribute('data-expanded') === 'true';

      if (!checkField(email)) { email.focus(); return; }

      if (!expanded) {
        // Step 1 → reveal the rest of the brief form (progressive disclosure)
        gate.setAttribute('data-expanded', 'true');
        var name = $('#gate-name');
        if (name) name.focus();
        return;
      }

      var fields = [$('#gate-name'), $('#gate-what')].filter(Boolean);
      var bad = fields.filter(function (f) { return !checkField(f); });
      if (bad.length) { bad[0].focus(); return; }

      gate.setAttribute('data-sent', 'true');
      var ok = $('.gate__ok', gate);
      if (ok) { ok.setAttribute('tabindex', '-1'); ok.focus(); }
    });
  }

  /* ---------- CONTACT FORM ---------- */
  var cForm = $('#contact-form');

  if (cForm) {
    wireBlur(cForm);

    cForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var fields = $$('.input', cForm);
      var bad = fields.filter(function (f) { return !checkField(f); });
      var summary = $('#form-summary');
      var list = $('#form-summary-list');

      if (bad.length) {
        // Inline errors stay put; the summary is added on top and takes focus.
        if (summary && list) {
          list.innerHTML = '';
          bad.forEach(function (f) {
            var li = document.createElement('li');
            var a = document.createElement('a');
            a.href = '#' + f.id;
            a.textContent = labelOf(f) + ' — ' + (document.getElementById(f.getAttribute('aria-describedby')) || {}).textContent;
            a.addEventListener('click', function (ev) { ev.preventDefault(); f.focus(); });
            li.appendChild(a);
            list.appendChild(li);
          });
          summary.setAttribute('data-show', 'true');
          summary.focus();
        } else {
          bad[0].focus();
        }
        return;
      }

      if (summary) summary.setAttribute('data-show', 'false');

      var btn = $('#c-submit');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

      // No backend in this build — the success state is the deliverable.
      window.setTimeout(function () {
        cForm.setAttribute('data-sent', 'true');
        var ok = $('.form__ok', cForm);
        if (ok) { ok.setAttribute('tabindex', '-1'); ok.focus(); }
      }, 450);
    });
  }

  /* ---------- WORK CAROUSEL ----------
     Native scroll-snap does the moving; the buttons are the
     keyboard-and-pointer equivalent. Nothing auto-rotates, so
     there is no pause control to provide. */
  var rail = $('#rail');
  var prev = $('#rail-prev');
  var next = $('#rail-next');

  if (rail && prev && next) {
    function step() {
      var card = $('.wcard', rail);
      if (!card) return rail.clientWidth;
      var gap = parseInt(getComputedStyle(rail).columnGap || '24', 10) || 24;
      return card.getBoundingClientRect().width + gap;
    }

    function sync() {
      var max = rail.scrollWidth - rail.clientWidth - 2;
      prev.disabled = rail.scrollLeft <= 2;
      next.disabled = rail.scrollLeft >= max;
    }

    prev.addEventListener('click', function () { rail.scrollBy({ left: -step(), behavior: 'smooth' }); });
    next.addEventListener('click', function () { rail.scrollBy({ left: step(), behavior: 'smooth' }); });

    var ticking = false;
    rail.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () { sync(); ticking = false; });
    });

    window.addEventListener('resize', sync);
    sync();
  }
})();
