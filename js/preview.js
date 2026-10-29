/* Preview home (index.html): the customer-side content (banners, products, shops) for visitors who are not logged in.
   The locked parts stay locked: search, the cart, hearts, the other categories and the menu links open the
   "login to continue" pop-up, and the blurred teaser at the bottom opens "Access Restricted" (js/locked-popup.js).
   Sample items show when Supabase is not reachable. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var sbOk = !!window.sb;
  var shops = [], cats = [], products = [];
  var shopName = {}, catName = {};
  var cur = 0, timer = null;

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var peso = function (n) { return '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 }); };
  var HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.6 1-1.1a5.5 5.5 0 0 0 0-7.7z"/></svg>';

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  /* ---------- the "login to continue" pop-up ---------- */
  var GATE = {
    search: ['🔍', 'Log in to search', 'Create an account or log in to search every shop and product.'],
    cart: ['🛒', 'Log in to shop', 'Your cart is ready once you log in or register.'],
    heart: ['♡', 'Log in to save', 'Log in to save products and shops to your favorites.'],
    pill: ['✨', 'Log in to browse', 'Log in to see the products of every category.'],
    'default': ['🔒', 'Log in to continue', 'Log in or register to explore the whole platform.']
  };
  function openGate(type) {
    var g = GATE[type] || GATE['default'];
    $('mEmoji').textContent = g[0];
    $('mTitle').textContent = g[1];
    $('mText').textContent = g[2];
    var lock = $('lockPopup');
    lock.classList.remove('open');
    lock.setAttribute('aria-hidden', 'true');
    $('overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeGate() {
    $('overlay').classList.remove('open');
    document.body.style.overflow = '';
  }
  // the blurred sections: a click only shows the "Access Restricted" pop-up
  function openLock() {
    $('overlay').classList.remove('open');
    var p = $('lockPopup');
    p.classList.add('open');
    p.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    var first = p.querySelector('a.btn');
    if (first) first.focus();
  }
  // About Us: scroll down to the footer (js/footer.js adds it at the end of the page)
  document.addEventListener('click', function (e) {
    if (e.target.closest('#aboutLink')) {
      e.preventDefault();
      var footer = document.querySelector('.site-footer');
      if (footer) footer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (e.target.closest('.guest-blur')) {
      e.preventDefault();
      openLock();
      return;
    }
    var gate = e.target.closest('[data-gate]');
    if (gate) {
      e.preventDefault();
      openGate(gate.dataset.gate);
      return;
    }
    var heart = e.target.closest('.ch-heart');
    if (heart) {
      e.preventDefault();
      openGate('heart');
      return;
    }
    if (e.target.id === 'overlay' || e.target.closest('[data-close]')) closeGate();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeGate();
  });

  /* ---------- hero: banners of the shops ---------- */
  function renderHero() {
    var list = shops.filter(function (b) { return b.banner_url; });
    var track = $('track');
    if (!list.length) {
      track.innerHTML = '<div class="ch-slide plain"><div class="ch-cap"><h2>Welcome to QCee!</h2><p>Log in to shop from your campus enterprises.</p></div></div>';
    } else {
      track.innerHTML = list.map(function (b) {
        return '<div class="ch-slide" style="background-image:url(&quot;' + esc(b.banner_url) + '&quot;)">' +
          '<div class="ch-cap"><span>' + esc(b.name) + '</span></div></div>';
      }).join('');
    }
    var n = track.children.length;
    $('dots').innerHTML = list.length > 1 ? Array.prototype.map.call(track.children, function (_, i) {
      return '<button type="button" data-i="' + i + '" aria-label="Show banner ' + (i + 1) + '"></button>';
    }).join('') : '';
    $('prev').hidden = $('next').hidden = n < 2;
    go(0);
    startAuto();
  }
  function go(i) {
    var n = $('track').children.length;
    if (!n) return;
    cur = (i + n) % n;
    $('track').style.transform = 'translateX(' + (-cur * 100) + '%)';
    Array.prototype.forEach.call($('dots').children, function (d, k) { d.classList.toggle('on', k === cur); });
  }
  function startAuto() {
    clearInterval(timer);
    if ($('track').children.length < 2) return;
    timer = setInterval(function () {
      if (!document.hidden && !$('hero').matches(':hover')) go(cur + 1);
    }, 5000);
  }
  $('prev').addEventListener('click', function () { go(cur - 1); startAuto(); });
  $('next').addEventListener('click', function () { go(cur + 1); startAuto(); });
  $('dots').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]');
    if (b) { go(Number(b.dataset.i)); startAuto(); }
  });
  var sx = null;
  $('hero').addEventListener('pointerdown', function (e) { sx = e.clientX; });
  $('hero').addEventListener('pointerup', function (e) {
    if (sx === null) return;
    var d = e.clientX - sx;
    sx = null;
    if (Math.abs(d) > 40) { go(cur + (d < 0 ? 1 : -1)); startAuto(); }
  });
  $('hero').addEventListener('pointerleave', function () { sx = null; });

  /* ---------- categories: only "All" is open; the rest are locked ---------- */
  // every category is listed, even the ones without products yet
  var CATEGORIES = ['Arts & Crafts', 'Bakes & Sweets', 'Fashion & Accessories'];
  var STICKER = { 'Arts & Crafts': '🎨', 'Bakes & Sweets': '🍪', 'Fashion & Accessories': '🎀' };
  function renderPills() {
    var names = CATEGORIES.slice();
    cats.forEach(function (c) { if (c.name && names.indexOf(c.name) < 0) names.push(c.name); });
    $('pills').innerHTML = '<button type="button" class="ch-pill on" data-cat="all"><span class="ch-stk" aria-hidden="true">✨</span>All Products</button>' +
      names.map(function (n) {
        return '<button type="button" class="ch-pill" data-gate="pill"><span class="ch-stk" aria-hidden="true">' +
          (STICKER[n] || '🏷️') + '</span>' + esc(n) + '</button>';
      }).join('');
  }

  function productCard(p) {
    var sold = Number(p.stock) <= 0;
    var img = p.image_url ? '<img src="' + esc(p.image_url) + '" alt="" loading="lazy">' : '<div class="ch-ph" aria-hidden="true"></div>';
    return '<article class="ch-card' + (sold ? ' sold' : '') + '">' +
      '<div class="ch-img">' + img + (sold ? '<span class="ch-badge">Sold out</span>' : '') + '</div>' +
      '<div class="ch-body">' +
        '<h3>' + esc(p.name) + '</h3>' +
        '<small>' + esc(shopName[p.business_id] || '') + '</small>' +
        '<div class="ch-row"><b>' + peso(p.price) + '</b>' +
        '<button type="button" class="ch-heart" aria-label="Save to favorites" aria-pressed="false">' + HEART + '</button>' +
        '</div></div></article>';
  }
  function renderProducts() {
    $('grid').innerHTML = products.map(productCard).join('');
    $('empty').hidden = products.length > 0;
    $('empty').textContent = 'No products yet. Products from the shops will show here.';
  }

  /* ---------- QCee Shops: each open shop with its picture and name ---------- */
  function shopCard(b) {
    var count = products.filter(function (p) { return p.business_id === b.id; }).length;
    var pic = b.logo_url || b.banner_url;
    var img = pic ? '<img src="' + esc(pic) + '" alt="" loading="lazy">' : '<div class="ch-ph" aria-hidden="true"></div>';
    return '<article class="ch-card ch-shop">' +
      '<div class="ch-img">' + img + '</div>' +
      '<div class="ch-body">' +
        '<h3>' + esc(b.name) + '</h3>' +
        '<small>' + esc(b.section || 'QCee shop') + '</small>' +
        '<div class="ch-row"><b>' + count + ' product' + (count === 1 ? '' : 's') + '</b>' +
        '<button type="button" class="ch-heart" aria-label="Save shop" aria-pressed="false">' + HEART + '</button>' +
        '</div></div></article>';
  }
  function renderShops() {
    $('shopGrid').innerHTML = shops.map(shopCard).join('');
    $('shopEmpty').hidden = shops.length > 0;
    $('shopEmpty').textContent = 'No shops yet. Approved shops will show here.';
  }

  /* ---------- load (public data only) ---------- */
  function draw() {
    shopName = {}; catName = {};
    shops.forEach(function (b) { shopName[b.id] = b.name; });
    cats.forEach(function (c) { catName[c.id] = c.name; });
    renderHero();
    renderPills();
    renderProducts();
    renderShops();
  }
  function sampleItems() {
    var names = [['Woven Potholder', 50], ['Paper Fan Wall', 75], ['Text tile Art', 150], ['Flower Lamp', 175], ['Flower Vase', 200], ['Assorted Cupcake', 270]];
    return names.map(function (n, i) {
      return { id: 'demo' + i, name: n[0], price: n[1], stock: 10, image_url: null, business_id: 'demo-shop', category_id: 'demo' };
    });
  }
  async function load() {
    if (!sbOk) {
      shops = [{ id: 'demo-shop', name: 'Sample shop', section: 'Arts & Crafts', logo_url: null, banner_url: null, is_open: true }];
      products = sampleItems();
      cats = [];
      draw();
      return;
    }
    var b = await sb.from('businesses').select('id, name, section, banner_url, logo_url, is_open').neq('is_open', false);
    var c = await sb.from('product_categories').select('id, name');
    var p = await sb.from('products').select('id, name, price, stock, image_url, business_id, category_id');
    if (b.error || p.error) {
      console.warn('preview:', b.error || p.error);
      toast("Couldn't load the shops yet. Check your connection.");
      shops = []; cats = []; products = [];
      draw();
      return;
    }
    shops = b.data || [];
    cats = (c && !c.error && c.data) || [];
    var open = {};
    shops.forEach(function (s) { open[s.id] = true; });
    products = (p.data || []).filter(function (x) { return open[x.business_id]; });
    draw();
  }

  // a visitor who is already logged in goes to their own home page
  (async function () {
    if (sbOk) {
      var s = (await sb.auth.getSession()).data.session;
      if (s) {
        var prof = await sb.from('profiles').select('role').eq('id', s.user.id).maybeSingle();
        var role = prof.data && prof.data.role;
        if (role === 'customer') { location.replace('customer-home.html'); return; }
        if (role === 'seller') { location.replace('seller-dashboard.html'); return; }
      }
    }
    await load();
  })();
})();