/* Opens the "Access Restricted" pop-up once, when the visitor scrolls down to the locked shops.
   It waits for a real scroll, so it never greets people on page load. If the page is too short
   to scroll at all, it opens after a moment instead. */
(function () {
  var locked = document.getElementById('locked');
  var popup = document.getElementById('lockPopup');
  if (!locked || !popup) return;

  var shown = false;
  var inView = false;
  var scrolled = false;
  var lastFocus = null;

  function open() {
    lastFocus = document.activeElement;
    popup.classList.add('open');
    popup.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';          // keep the page still behind the card
    var first = popup.querySelector('a.btn');
    if (first) first.focus();
  }

  function close() {
    popup.classList.remove('open');
    popup.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function maybeOpen() {
    if (shown || !inView || !scrolled) return;
    shown = true;               // only once per visit, so it never nags
    io.disconnect();
    open();
  }

  function onScroll() {
    scrolled = true;
    maybeOpen();
  }
  ['scroll', 'wheel', 'touchmove'].forEach(function (type) {
    window.addEventListener(type, onScroll, { passive: true, once: true });
  });

  popup.addEventListener('click', function (e) {
    if (e.target === popup || e.target.closest('[data-lock-close]')) { close(); return; }
    // Register / Log In: let the role picker take over, so get out of its way
    if (e.target.closest('a[data-pick]')) close();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && popup.classList.contains('open')) close();
  });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      inView = entry.isIntersecting;
      maybeOpen();
    });
  }, { threshold: 0.35 });
  io.observe(locked);

  // page too short to scroll (big screens): open after a short pause if the locked part is showing
  setTimeout(function () {
    var scrollable = document.documentElement.scrollHeight > window.innerHeight + 4;
    if (!scrollable) { scrolled = true; maybeOpen(); }
  }, 1500);
})();