(function () {
  var $ = function (id) { return document.getElementById(id); };
  var sbOk = !!window.sb;
  var shops = [], cats = [], products = [];
  var shopName = {}, catName = {};
  var activeCat = 'all', query = '', cur = 0, timer = null;
  /* saved-product heart: filled circle with the heart cut out (from the design) */
  var SAVED_ICON = '<svg viewBox="0 0 42 42" fill="none" aria-hidden="true"><path d="M20.8333 0C9.34583 0 0 9.34583 0 20.8333C0 32.3208 9.34583 41.6667 20.8333 41.6667C32.3208 41.6667 41.6667 32.3208 41.6667 20.8333C41.6667 9.34583 32.3208 0 20.8333 0ZM29.5542 22.375L20.8333 31.0958L12.1125 22.375C11.5736 21.843 11.1458 21.2094 10.8537 20.5107C10.5617 19.8121 10.4113 19.0624 10.4113 18.3052C10.4113 17.548 10.5617 16.7983 10.8537 16.0997C11.1458 15.4011 11.5736 14.7674 12.1125 14.2354C12.6444 13.6969 13.278 13.2693 13.9764 12.9774C14.6749 12.6856 15.4243 12.5353 16.1813 12.5353C16.9382 12.5353 17.6876 12.6856 18.3861 12.9774C19.0845 13.2693 19.7181 13.6969 20.25 14.2354L20.8333 14.8167L21.4146 14.2354C21.9465 13.6969 22.5801 13.2693 23.2785 12.9774C23.9769 12.6856 24.7264 12.5353 25.4833 12.5353C26.2403 12.5353 26.9897 12.6856 27.6882 12.9774C28.3866 13.2693 29.0202 13.6969 29.5521 14.2354C30.0911 14.7672 30.5191 15.4008 30.8113 16.0994C31.1035 16.7979 31.2541 17.5476 31.2543 18.3048C31.2545 19.062 31.1043 19.8117 30.8125 20.5104C30.5206 21.2091 30.0929 21.8429 29.5542 22.375Z" fill="#EDA03F"/></svg>';
  var HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.6 1-1.1a5.5 5.5 0 0 0 0-7.7z"/></svg>';

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var peso = function (n) { return '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 }); };

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  /* avatar opens the account menu (My Profile, Log out) */
  var av = $('avatar'), avMenu = $('avMenu');
  av.addEventListener('click', function (e) {
    e.stopPropagation();
    avMenu.hidden = !avMenu.hidden;
    av.setAttribute('aria-expanded', String(!avMenu.hidden));
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.ch-me')) avMenu.hidden = true;
  });
  $('logout').addEventListener('click', async function () {
    await signOutHere();
    location.replace('index.html');
  });
  /* clear the session in this browser (no server call needed), so the sign-in page does not send the user back */
  async function signOutHere() {
    try { if (sbOk) await sb.auth.signOut({ scope: 'local' }); } catch (e) {}
    try {
      Object.keys(localStorage).forEach(function (k) { if (/^sb-.*-auth-token/.test(k)) localStorage.removeItem(k); });
    } catch (e) {}
  }

  var searchForm = $('chSearch');
  $('searchBtn').addEventListener('click', function (e) {
    if (window.innerWidth <= 700 && !searchForm.classList.contains('open')) {
      e.preventDefault();
      searchForm.classList.add('open');
      $('q').focus();
    }
  });
  $('chat').addEventListener('click', function () { location.href = 'messages.html'; });

  function sampleItems() {
    var names = [['Woven Potholder', 50, 'Arts & Crafts'], ['Paper Fan Wall', 75, 'Arts & Crafts'], ['Text tile Art', 150, 'Arts & Crafts'],
      ['Flower Lamp', 175, 'Arts & Crafts'], ['Flower Vase', 200, 'Arts & Crafts'], ['Assorted Cupcake', 270, 'Bakes & Sweets']];
    return names.map(function (n, i) {
      return { id: 'demo' + i, name: n[0], price: n[1], stock: 10, image_url: null, business_id: 'demo-shop', category_id: 'demo-' + n[2] };
    });
  }

  function renderHero() {
    var list = shops.filter(function (b) { return b.banner_url; });
    var track = $('track');
    if (!list.length) {
      track.innerHTML = '<div class="ch-slide plain"><div class="ch-cap"><h2>Welcome to QCee!</h2><p>Shop from your campus enterprises.</p></div></div>';
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

  var CATEGORIES = ['Arts & Crafts', 'Bakes & Sweets', 'Fashion & Accessories'];
  var STICKER = { 'Arts & Crafts': '🎨', 'Bakes & Sweets': '🍪', 'Fashion & Accessories': '🎀' };
  function renderPills() {
    var names = CATEGORIES.slice();
    cats.forEach(function (c) { if (c.name && names.indexOf(c.name) < 0) names.push(c.name); });
    $('pills').innerHTML = '<button type="button" class="ch-pill' + (activeCat === 'all' ? ' on' : '') + '" data-cat="all"><span class="ch-stk" aria-hidden="true">✨</span>All Products</button>' +
      names.map(function (n) {
        return '<button type="button" class="ch-pill' + (activeCat === n ? ' on' : '') + '" data-cat="' + esc(n) + '"><span class="ch-stk" aria-hidden="true">' +
          (STICKER[n] || '🏷️') + '</span>' + esc(n) + '</button>';
      }).join('');
  }
  $('pills').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cat]');
    if (!b) return;
    activeCat = b.dataset.cat;
    renderPills();
    renderProducts();
    renderShops();
  });

  function productCard(p) {
    var sold = Number(p.stock) <= 0, liked = isSaved('products', p.id);
    var img = p.image_url ? '<img src="' + esc(p.image_url) + '" alt="" loading="lazy">' : '<div class="ch-ph" aria-hidden="true"></div>';
    return '<article class="ch-card' + (sold ? ' sold' : '') + '" data-pid="' + esc(p.id) + '">' +
      '<div class="ch-img">' + img + (sold ? '<span class="ch-badge">Sold out</span>' : '') + '</div>' +
      '<div class="ch-body"><h3>' + esc(p.name) + '</h3><small>' + esc(catName[p.category_id] || '') + '</small>' +
      '<div class="ch-row"><b>' + peso(p.price) + '</b>' +
      '<button type="button" class="ch-heart' + (liked ? ' on' : '') + '" data-kind="products" data-id="' + esc(p.id) + '" aria-label="Save product" aria-pressed="' + liked + '">' + HEART + '</button>' +
      '</div></div></article>';
  }
  function renderProducts() {
    var q = query.toLowerCase();
    var list = products.filter(function (p) {
      if (activeCat !== 'all' && catName[p.category_id] !== activeCat) return false;
      if (!q) return true;
      return ((p.name || '') + ' ' + (shopName[p.business_id] || '')).toLowerCase().indexOf(q) > -1;
    });
    $('grid').innerHTML = list.map(productCard).join('');
    $('empty').hidden = list.length > 0;
    $('empty').textContent = products.length ? 'No products match your choice yet.' : 'No products yet. Products from the shops will show here.';
  }

  function shopCard(b, count) {
    var liked = isSaved('shops', b.id);
    var pic = b.logo_url || b.banner_url;
    var img = pic ? '<img src="' + esc(pic) + '" alt="" loading="lazy">' : '<div class="ch-ph" aria-hidden="true"></div>';
    return '<article class="ch-card ch-shop" data-bid="' + esc(b.id) + '">' +
      '<div class="ch-img">' + img + '</div><div class="ch-body"><h3>' + esc(b.name) + '</h3>' +
      '<small>' + esc(b.section || 'QCee shop') + '</small>' +
      '<div class="ch-row"><b>' + count + ' product' + (count === 1 ? '' : 's') + '</b>' +
      '<button type="button" class="ch-heart' + (liked ? ' on' : '') + '" data-kind="shops" data-id="' + esc(b.id) + '" aria-label="Save shop" aria-pressed="' + liked + '">' + HEART + '</button>' +
      '</div></div></article>';
  }
  function renderShops() {
    var q = query.toLowerCase();
    var list = shops.filter(function (b) {
      var sells = products.some(function (p) {
        return p.business_id === b.id && (activeCat === 'all' || catName[p.category_id] === activeCat);
      });
      if (activeCat !== 'all' && !sells) return false;
      return !q || String(b.name || '').toLowerCase().indexOf(q) > -1;
    });
    $('shopGrid').innerHTML = list.map(function (b) {
      var count = products.filter(function (p) {
        return p.business_id === b.id && (activeCat === 'all' || catName[p.category_id] === activeCat);
      }).length;
      return shopCard(b, count);
    }).join('');
    $('shopEmpty').hidden = list.length > 0;
    $('shopEmpty').textContent = shops.length ? 'No shops match your choice yet.' : 'No shops yet. Approved shops will show here.';
  }

  /* hearts on the product and shop cards save to two separate lists */
  document.addEventListener('click', function (e) {
    var h = e.target.closest('.ch-heart');
    if (!h || h.closest('#fvBody')) return;   /* the Saved panel handles its own hearts */
    var kind = h.dataset.kind, id = h.dataset.id;
    if (kind === 'shops') {
      var shop = shops.find(function (s) { return String(s.id) === id; });
      if (!isSaved('shops', id) && !shop) return;
      toggleSave('shops', id, shop);
      renderShops();
    } else {
      var prod = products.find(function (x) { return String(x.id) === id; });
      if (!isSaved('products', id) && !prod) return;
      toggleSave('products', id, prod);
      renderProducts();
    }
  });
  $('grid').addEventListener('click', function (e) {
    if (e.target.closest('.ch-heart')) return;
    var card = e.target.closest('.ch-card[data-pid]');
    if (!card) return;
    var p = products.find(function (x) { return String(x.id) === card.dataset.pid; });
    if (p) openProduct(p);
  });
  $('q').addEventListener('input', function (e) {
    query = e.target.value.trim();
    renderProducts();
    renderShops();
  });

  function draw() {
    shopName = {}; catName = {};
    shops.forEach(function (b) { shopName[b.id] = b.name; });
    cats.forEach(function (c) { catName[c.id] = c.name; });
    renderHero(); renderPills(); renderProducts(); renderShops();
  }
  async function load() {
    if (!sbOk) {
      shops = [{ id: 'demo-shop', name: 'Charms Studio', section: 'Arts & Crafts', logo_url: null, banner_url: null, is_open: true, location: 'QCU Main Campus - Admin Building', hours: 'Mon - Fri | 8:00 AM - 5:00 PM' }];
      products = sampleItems();
      cats = [{ id: 'demo-Arts & Crafts', name: 'Arts & Crafts' }, { id: 'demo-Bakes & Sweets', name: 'Bakes & Sweets' }];
      draw();
      return;
    }
    var b = await sb.from('businesses').select('id, name, section, banner_url, logo_url, is_open, location, hours, address');
    if (b.error) b = await sb.from('businesses').select('id, name, section, banner_url, logo_url, is_open');
    var c = await sb.from('product_categories').select('id, name');
    var p = await sb.from('products').select('id, name, price, stock, image_url, business_id, category_id, description, variants, gallery_urls');
    if (p.error) p = await sb.from('products').select('id, name, price, stock, image_url, business_id, category_id');
    if (b.error || p.error) {
      toast("Couldn't load the shops yet. Check your connection.");
      shops = []; cats = []; products = [];
      draw();
      return;
    }
    // closed shops stay in the list; the shop's popup shows that it is closed
    shops = b.data || [];
    cats = (c && !c.error && c.data) || [];
    var open = {};
    shops.forEach(function (s) { open[s.id] = true; });
    products = (p.data || []).filter(function (x) { return open[x.business_id]; });
    draw();
  }

  var pvOverlay = $('pvOverlay'), pvQty = 1, pvVariant = null, pvProduct = null;
  var pvReady = !!pvOverlay;

  function openProduct(p) {
    if (!pvReady) return;
    pvProduct = p;
    pvQty = 1;
    pvVariant = (p.variants && p.variants[0]) || null;
    /* cover first, then the seller's extra pictures as thumbnails */
    var pics = [p.image_url].concat(p.gallery_urls || []).filter(Boolean);
    var img = $('pvImg'), ph = $('pvPh');
    showPic(pics[0] || null);
    $('pvThumbs').innerHTML = pics.map(function (u, i) {
      return '<button type="button" class="pv-thumb' + (i === 0 ? ' on' : '') + '" data-src="' + esc(u) + '" aria-label="Picture ' + (i + 1) + '"><img src="' + esc(u) + '" alt=""></button>';
    }).join('');
    $('pvThumbs').hidden = pics.length < 2;
    function showPic(src) {
      if (src) { img.src = src; img.hidden = false; ph.hidden = true; }
      else { img.hidden = true; ph.hidden = false; }
    }
    $('pvShopName').textContent = shopName[p.business_id] || '';
    $('pvShopLink').dataset.shop = p.business_id || '';
    var cname = catName[p.category_id] || 'Uncategorized';
    $('pvCat').innerHTML = '<span class="ch-stk" aria-hidden="true">' + (STICKER[cname] || '🏷️') + '</span>' + esc(cname);
    $('pvName').textContent = p.name || '';
    $('pvPrice').textContent = peso(p.price);
    $('pvDesc').textContent = p.description || '';
    $('pvDesc').hidden = !p.description;
    var sold = Number(p.stock) <= 0;
    $('pvAvail').className = 'pv-avail ' + (sold ? 'out' : 'in');
    $('pvAvailText').textContent = sold ? 'Out of Stock' : 'In Stock';
    $('pvAvailIcon').hidden = sold;
    var variants = p.variants || [];
    $('pvVariants').hidden = variants.length === 0;
    $('pvChips').innerHTML = variants.map(function (v) {
      return '<button type="button" class="pv-chip' + (v === pvVariant ? ' on' : '') + '" data-v="' + esc(v) + '">' + esc(v) + '</button>';
    }).join('');
    $('pvQty').textContent = pvQty;
    $('pvMinus').disabled = pvQty <= 1;
    $('pvPlus').disabled = sold || pvQty >= Math.max(1, Number(p.stock) || 1);
    $('pvAdd').disabled = sold;
    $('pvAdd').textContent = sold ? 'Out of Stock' : 'Add to Cart';
    pvOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeProduct() {
    if (!pvOverlay) return;
    pvOverlay.hidden = true;
    document.body.style.overflow = '';
    pvProduct = null;
  }
  function pvSetQty(n) {
    if (!pvProduct) return;
    var max = Math.max(1, Number(pvProduct.stock) || 1);
    pvQty = Math.min(max, Math.max(1, n));
    $('pvQty').textContent = pvQty;
    $('pvMinus').disabled = pvQty <= 1;
    $('pvPlus').disabled = pvQty >= max;
  }
  if (pvReady) {
    $('pvClose').addEventListener('click', closeProduct);
    pvOverlay.addEventListener('click', function (e) { if (e.target === pvOverlay) closeProduct(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('svOverlay') && !$('svOverlay').hidden) { closeShop(); return; }
      if (e.key === 'Escape' && !pvOverlay.hidden && $('lbOverlay').hidden) closeProduct();
    });
    $('pvShopLink').addEventListener('click', function (e) {
      e.preventDefault();
      var shop = shops.find(function (s) { return String(s.id) === $('pvShopLink').dataset.shop; });
      if (shop) openShop(shop);
    });
    $('pvChips').addEventListener('click', function (e) {
      var chip = e.target.closest('.pv-chip');
      if (!chip) return;
      pvVariant = chip.dataset.v;
      Array.prototype.forEach.call($('pvChips').children, function (c) { c.classList.toggle('on', c === chip); });
    });
    $('pvMinus').addEventListener('click', function () { pvSetQty(pvQty - 1); });
    $('pvPlus').addEventListener('click', function () { pvSetQty(pvQty + 1); });
    $('pvAdd').addEventListener('click', function () {
      if (!pvProduct || Number(pvProduct.stock) <= 0) return;
      addToCart(pvProduct, pvQty, pvVariant);
      toast('Added ' + pvQty + ' × ' + pvProduct.name + (pvVariant ? ' (' + pvVariant + ')' : '') + ' to your cart.');
      closeProduct();
    });
  }

  $('pvThumbs').addEventListener('click', function (e) {
    var t = e.target.closest('.pv-thumb');
    if (!t) return;
    $('pvImg').src = t.dataset.src;
    $('pvImg').hidden = false;
    $('pvPh').hidden = true;
    Array.prototype.forEach.call($('pvThumbs').children, function (c) { c.classList.toggle('on', c === t); });
    openLb(thumbSrcs(), Array.prototype.indexOf.call($('pvThumbs').children, t));
  });

  /* full-size picture pop-up: the main picture and each extra picture open it */
  var lbList = [], lbIndex = 0;
  function thumbSrcs() {
    return Array.prototype.map.call($('pvThumbs').querySelectorAll('.pv-thumb'), function (t) { return t.dataset.src; });
  }
  function openLb(list, i) {
    if (!list.length) return;
    lbList = list;
    lbIndex = Math.max(0, i);
    showLb();
    $('lbOverlay').hidden = false;
  }
  function showLb() {
    $('lbImg').src = lbList[lbIndex];
    $('lbPrev').hidden = lbList.length < 2;
    $('lbNext').hidden = lbList.length < 2;
  }
  function closeLb() {
    $('lbOverlay').hidden = true;
    $('lbImg').removeAttribute('src');
  }
  $('pvImg').addEventListener('click', function () {
    if (this.hidden) return;
    var list = thumbSrcs();
    if (!list.length) list = [this.getAttribute('src')];
    var on = $('pvThumbs').querySelector('.pv-thumb.on');
    openLb(list, on ? Array.prototype.indexOf.call($('pvThumbs').children, on) : 0);
  });
  $('lbClose').addEventListener('click', closeLb);
  $('lbOverlay').addEventListener('click', function (e) { if (e.target === this) closeLb(); });
  $('lbPrev').addEventListener('click', function () { lbIndex = (lbIndex - 1 + lbList.length) % lbList.length; showLb(); });
  $('lbNext').addEventListener('click', function () { lbIndex = (lbIndex + 1) % lbList.length; showLb(); });
  document.addEventListener('keydown', function (e) {
    if ($('lbOverlay').hidden) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') $('lbPrev').click();
    if (e.key === 'ArrowRight') $('lbNext').click();
  });

  var curShopId = null;   // the shop whose popup is open
  function openShop(b) {
    var sv = $('svOverlay');
    if (!sv || !b) return;
    curShopId = b.id;
    if (pvReady && !pvOverlay.hidden) closeProduct();
    $('svBanner').style.backgroundImage = b.banner_url ? 'url("' + b.banner_url + '")' : '';
    $('svLogo').style.backgroundImage = (b.logo_url || b.banner_url) ? 'url("' + (b.logo_url || b.banner_url) + '")' : '';
    $('svName').textContent = b.name || 'Shop';
    var open = b.is_open !== false;
    var pill = $('svOpen');
    pill.textContent = open ? 'OPEN NOW' : 'CLOSED';
    pill.classList.toggle('off', !open);
    $('svLoc').textContent = b.location || b.address || 'QCU Main Campus - Admin Building';
    $('svHours').innerHTML = (b.hours || 'Mon - Fri | 8:00 AM - 5:00 PM').split('|').map(function (s) { return esc(s.trim()); }).join('<i class="sv-sep" aria-hidden="true"></i>');
    var items = products.filter(function (p) { return p.business_id === b.id; });
    $('svGrid').innerHTML = items.map(function (p) {
      var img = p.image_url ? '<img src="' + esc(p.image_url) + '" alt="">' : '<div class="ch-ph"></div>';
      return '<button type="button" class="sv-item" data-pid="' + esc(p.id) + '">' + img +
        '<span class="sv-item-name">' + esc(p.name) + '<i class="sv-item-heart" aria-hidden="true">' + HEART + '</i></span>' +
        '<b class="sv-item-price">' + peso(p.price) + '</b></button>';
    }).join('') || '<p class="ch-empty">No items in this stall yet.</p>';
    // on phones keep the site header visible above the popup, like the mock-up
    sv.style.top = window.innerWidth <= 700 ? document.querySelector('.ch-top').getBoundingClientRect().bottom + 'px' : '';
    sv.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeShop() {
    var sv = $('svOverlay');
    if (!sv) return;
    sv.hidden = true;
    sv.style.top = '';
    document.body.style.overflow = '';
  }
  if ($('svOverlay')) {
    $('svClose').addEventListener('click', closeShop);
    $('svOverlay').addEventListener('click', function (e) { if (e.target === $('svOverlay')) closeShop(); });
    $('svMsg').addEventListener('click', function () {
      location.href = 'messages.html?shop=' + encodeURIComponent(curShopId || '');
    });
    $('svGrid').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-pid]');
      if (!btn) return;
      var p = products.find(function (x) { return String(x.id) === btn.dataset.pid; });
      closeShop();
      if (p) openProduct(p);
    });
    $('shopGrid').addEventListener('click', function (e) {
      if (e.target.closest('.ch-heart')) return;
      var card = e.target.closest('[data-bid]');
      if (!card) return;
      var b = shops.find(function (s) { return String(s.id) === card.dataset.bid; });
      if (b) openShop(b);
    });
  }

  /* ---------- saved products and shops (the heart), kept in this browser ---------- */
  var SAVE_KEY = 'qcee_saved';
  var saved = { products: {}, shops: {} };
  try {
    var stored = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (stored && stored.products && stored.shops) saved = stored;
  } catch (e) {}
  var dbUser = null;   /* set when a customer is signed in; their changes also go to the database */
  function dbWrite(query) {
    if (!dbUser) return;
    query.then(function (r) {
      if (r && r.error) toast("Couldn't save that change: " + r.error.message);
    }, function () { toast("Couldn't save that change."); });
  }
  function saveSaved() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch (e) {} }
  function isSaved(kind, id) { return !!saved[kind][String(id)]; }
  function toggleSave(kind, id, obj) {
    var k = String(id);
    var table = kind === 'products' ? 'saved_products' : 'saved_shops';
    var col = kind === 'products' ? 'product_id' : 'shop_id';
    if (saved[kind][k]) {
      delete saved[kind][k];
      if (dbUser) dbWrite(sb.from(table).delete().eq('user_id', dbUser).eq(col, k));
    } else if (obj) {
      saved[kind][k] = obj;
      var row = { user_id: dbUser, data: obj };
      row[col] = k;
      if (dbUser) dbWrite(sb.from(table).upsert(row));
    }
    saveSaved();
  }
  /* a shop is closed when the seller has switched it off */
  function shopClosed(sid) {
    var s = shops.filter(function (x) { return String(x.id) === String(sid); })[0];
    return !!s && s.is_open === false;
  }

  /* load a signed-in customer's cart, purchase options and saved items from the database */
  async function loadAccount(uid) {
    dbUser = uid;
    var r1 = await sb.from('customer_cart_items').select('product_id, variant, qty, data').eq('user_id', uid);
    var r2 = await sb.from('customer_shop_options').select('shop_id, purchase_option').eq('user_id', uid);
    var r3 = await sb.from('saved_products').select('product_id, data').eq('user_id', uid);
    var r4 = await sb.from('saved_shops').select('shop_id, data').eq('user_id', uid);
    if (r1.error || r2.error || r3.error || r4.error) {
      toast("Couldn't load your cart and saved items.");
      return;
    }
    cart = {
      items: (r1.data || []).map(function (r) {
        var d = r.data || {};
        return {
          id: r.product_id, name: d.name, price: Number(d.price) || 0, image_url: d.image_url || null,
          shop_id: d.shop_id, shop_name: d.shop_name || 'Shop', variant: r.variant || null,
          qty: r.qty, stock: Number(d.stock) || r.qty, selected: d.selected !== false
        };
      }),
      options: {}
    };
    (r2.data || []).forEach(function (r) { cart.options[r.shop_id] = r.purchase_option; });
    saved = { products: {}, shops: {} };
    (r3.data || []).forEach(function (r) { saved.products[r.product_id] = r.data; });
    (r4.data || []).forEach(function (r) { saved.shops[r.shop_id] = r.data; });
    saveSaved(); saveCart(); updateCartBadge();
  }

  var fvTab = 'products';
  function favProductRow(p) {
    var img = p.image_url ? '<img src="' + esc(p.image_url) + '" alt="">' : '<div class="ch-ph"></div>';
    return '<div class="cd-item fv-row" data-open="products" data-id="' + esc(p.id) + '">' +
      '<div class="cd-img">' + img + '</div>' +
      '<div class="cd-info"><b>' + esc(p.name) + '</b><small>' + esc(p.shop_name || shopName[p.business_id] || '') + '</small>' +
      '<div class="cd-line"><span class="cd-price">' + peso(p.price) + '</span></div></div>' +
      '<div class="fv-actions">' +
      '<button type="button" class="ch-heart on fv-heart" data-kind="products" data-id="' + esc(p.id) + '" aria-label="Remove from saved" aria-pressed="true">' + SAVED_ICON + '</button>' +
      '<button type="button" class="fv-addcart" data-add="' + esc(p.id) + '"' + (Number(p.stock) <= 0 ? ' disabled' : '') + '>' +
      (Number(p.stock) <= 0 ? 'Sold out' : 'Add to Cart') + '</button>' +
      '</div>' +
      '</div>';
  }
  function favShopRow(b) {
    var pic = b.logo_url || b.banner_url;
    var img = pic ? '<img src="' + esc(pic) + '" alt="">' : '<div class="ch-ph"></div>';
    return '<div class="cd-item fv-row" data-open="shops" data-id="' + esc(b.id) + '">' +
      '<div class="cd-img">' + img + '</div>' +
      '<div class="cd-info"><b>' + esc(b.name) + '</b><small>' + esc(b.section || 'QCee shop') + '</small></div>' +
      '<button type="button" class="ch-heart on" data-kind="shops" data-id="' + esc(b.id) + '" aria-label="Remove from saved" aria-pressed="true">' + HEART + '</button>' +
      '</div>';
  }
  function renderFav() {
    var pk = Object.keys(saved.products), sk = Object.keys(saved.shops);
    $('fvCountProducts').textContent = pk.length;
    $('fvCountShops').textContent = sk.length;
    Array.prototype.forEach.call(document.querySelectorAll('.fv-tab'), function (t) {
      var on = t.dataset.tab === fvTab;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', String(on));
    });
    var body = $('fvBody');
    if (fvTab === 'products') {
      body.innerHTML = pk.length
        ? pk.map(function (k) { return favProductRow(saved.products[k]); }).join('')
        : '<p class="cd-empty">No saved products yet. Tap the heart on a product to save it here.</p>';
    } else {
      body.innerHTML = sk.length
        ? sk.map(function (k) { return favShopRow(saved.shops[k]); }).join('')
        : '<p class="cd-empty">No saved shops yet. Tap the heart on a shop to save it here.</p>';
    }
  }
  function openFav() {
    renderFav();
    $('fvOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeFav() {
    $('fvOverlay').hidden = true;
    document.body.style.overflow = '';
  }
  $('favBtn').addEventListener('click', openFav);
  $('fvClose').addEventListener('click', closeFav);
  $('fvOverlay').addEventListener('click', function (e) { if (e.target === $('fvOverlay')) closeFav(); });
  document.querySelectorAll('.fv-tab').forEach(function (t) {
    t.addEventListener('click', function () { fvTab = t.dataset.tab; renderFav(); });
  });
  $('fvBody').addEventListener('click', function (e) {
    var add = e.target.closest('.fv-addcart');
    if (add) {
      e.stopPropagation();
      var sp = saved.products[add.dataset.add];
      if (sp && Number(sp.stock) > 0) {
        addToCart(sp, 1, (sp.variants && sp.variants[0]) || null);
        toast('Added ' + sp.name + ' to your cart.');
      }
      return;
    }
    var heart = e.target.closest('.ch-heart');
    if (heart) {
      e.stopPropagation();   /* the card-level heart handler must not run again */
      toggleSave(heart.dataset.kind, heart.dataset.id, null);   /* removing only */
      renderFav();
      renderProducts();
      renderShops();
      return;
    }
    var row = e.target.closest('.fv-row');
    if (!row) return;
    var id = row.dataset.id;
    if (row.dataset.open === 'products' && saved.products[id]) {
      closeFav();
      openProduct(saved.products[id]);
    } else if (row.dataset.open === 'shops' && saved.shops[id]) {
      closeFav();
      openShop(saved.shops[id]);
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('fvOverlay').hidden) closeFav(); });

  /* ---------- cart: saved in this browser, shown from the header cart icon ---------- */
  var CART_KEY = 'qcee_cart';
  var cart = { items: [], options: {} };
  try {
    var storedCart = JSON.parse(localStorage.getItem(CART_KEY) || 'null');
    if (storedCart && Array.isArray(storedCart.items)) cart = { items: storedCart.items, options: storedCart.options || {} };
  } catch (e) {}
  function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} }
  function cartCount() { return cart.items.reduce(function (n, i) { return n + i.qty; }, 0); }
  function updateCartBadge() {
    var n = cartCount(), el = $('cartCount');
    el.textContent = n > 99 ? '99+' : n;
    el.hidden = n === 0;
  }
  function addToCart(p, qty, variant) {
    var v = variant || null;
    var max = Math.max(1, Number(p.stock) || 1);
    var item = cart.items.find(function (i) { return i.id === p.id && i.variant === v; });
    if (item) {
      item.qty = Math.min(max, item.qty + qty);
      item.stock = max;
      item.selected = true;
    } else {
      item = {
        id: p.id, name: p.name, price: Number(p.price) || 0, image_url: p.image_url || null,
        shop_id: p.business_id, shop_name: shopName[p.business_id] || p.shop_name || 'Shop',
        variant: v, qty: Math.min(max, qty), stock: max, selected: true
      };
      cart.items.push(item);
    }
    if (!cart.options[p.business_id]) cart.options[p.business_id] = 'now';
    saveCart();
    updateCartBadge();
    if (dbUser) {
      dbWrite(sb.from('customer_cart_items').upsert({
        user_id: dbUser, product_id: String(p.id), variant: v || '', qty: item.qty,
        data: itemData(item)
      }));
    }
  }
  function itemData(it) {
    return { name: it.name, price: it.price, image_url: it.image_url, shop_id: it.shop_id, shop_name: it.shop_name, stock: it.stock, selected: it.selected !== false };
  }
  function isPicked(it) { return it.selected !== false; }
  /* a tick box change is saved here and, for a signed-in customer, in the database */
  function setPicked(it) {
    saveCart();
    if (dbUser) dbWrite(sb.from('customer_cart_items').update({ data: itemData(it) }).eq('user_id', dbUser).eq('product_id', String(it.id)).eq('variant', it.variant || ''));
  }
  function cartRow(it, idx) {
    var img = it.image_url ? '<img src="' + esc(it.image_url) + '" alt="">' : '<div class="ch-ph"></div>';
    return '<div class="cd-item">' +
      '<input type="checkbox" class="cd-pick" data-pick="' + idx + '" aria-label="Check out ' + esc(it.name) + '"' + (isPicked(it) ? ' checked' : '') + '>' +
      '<div class="cd-img">' + img + '</div>' +
      '<div class="cd-info"><b>' + esc(it.name) + '</b>' +
      (it.variant ? '<small>' + esc(it.variant) + '</small>' : '') +
      '<div class="cd-line"><span class="cd-price">' + peso(it.price) + '</span>' +
      '<div class="cd-qty">' +
      '<button type="button" data-act="dec" data-idx="' + idx + '" aria-label="Decrease quantity">&minus;</button>' +
      '<span>' + it.qty + '</span>' +
      '<button type="button" data-act="inc" data-idx="' + idx + '" aria-label="Increase quantity">+</button>' +
      '</div></div></div>' +
      '<button type="button" class="cd-remove" data-act="rm" data-idx="' + idx + '" aria-label="Remove item">&times;</button>' +
      '</div>';
  }
  function renderCart() {
    var body = $('cdBody'), foot = $('cdFoot');
    if (!cart.items.length) {
      body.innerHTML = '<p class="cd-empty">Your cart is empty. Add products to see them here.</p>';
      foot.hidden = true;
      return;
    }
    var groups = {}, order = [];
    cart.items.forEach(function (it, idx) {
      if (!groups[it.shop_id]) { groups[it.shop_id] = { name: it.shop_name, items: [] }; order.push(it.shop_id); }
      groups[it.shop_id].items.push({ it: it, idx: idx });
    });
    body.innerHTML = order.map(function (sid) {
      var g = groups[sid];
      var closed = shopClosed(sid);                       // a closed shop takes Pre-Orders only
      var opt = closed ? 'pre' : (cart.options[sid] || 'now');
      var picked = g.items.filter(function (x) { return isPicked(x.it); }).length;
      var all = picked === g.items.length;
      return '<section class="cd-shop">' +
        '<header class="cd-shopname"><label class="cd-all">' +
        '<input type="checkbox" data-pick-shop="' + esc(sid) + '"' + (all ? ' checked' : '') + (picked && !all ? ' data-mixed="1"' : '') + '>' +
        esc(g.name) + '</label></header>' +
        g.items.map(function (x) { return cartRow(x.it, x.idx); }).join('') +
        '<div class="cd-opts">' +
        (closed ? '<p class="cd-note">Closed right now. Pre-Order only.</p>' : '') +
        '<label class="' + (closed ? 'cd-off' : '') + '"><input type="radio" name="opt-' + esc(sid) + '" data-sid="' + esc(sid) + '" value="now"' + (opt === 'now' ? ' checked' : '') + (closed ? ' disabled' : '') + '> Order Now</label>' +
        '<label><input type="radio" name="opt-' + esc(sid) + '" data-sid="' + esc(sid) + '" value="pre"' + (opt === 'pre' ? ' checked' : '') + '> Pre-Order</label>' +
        '<button type="button" class="cd-checkout" data-checkout="' + esc(sid) + '"' + (picked ? '' : ' disabled') + '>Check Out</button>' +
        '</div></section>';
    }).join('');
    Array.prototype.forEach.call(body.querySelectorAll('input[data-mixed]'), function (el) { el.indeterminate = true; });

    /* totals and the button count only the items that are ticked */
    var picked = cart.items.filter(isPicked);
    var subtotal = picked.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
    foot.hidden = false;
    foot.innerHTML = '<div class="cd-sum">' +
      '<div><span>SubTotal:</span><b>' + peso(subtotal) + '</b></div>' +
      '<div class="cd-total"><span>Total:</span><b>' + peso(subtotal) + '</b></div>' +
      '</div>' +
      '<button type="button" class="cd-proceed" id="cdProceed"' + (picked.length ? '' : ' disabled') + '>' +
      (picked.length ? 'Proceed to Checkout (' + picked.length + ') &rarr;' : 'Select items to check out') + '</button>';
  }
  function openCart() {
    renderCart();
    $('cdOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeCart() {
    $('cdOverlay').hidden = true;
    document.body.style.overflow = '';
  }
  $('cartBtn').addEventListener('click', openCart);
  $('cdClose').addEventListener('click', closeCart);
  $('cdOverlay').addEventListener('click', function (e) { if (e.target === $('cdOverlay')) closeCart(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('cdOverlay').hidden) closeCart(); });
  $('cdBody').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (b) {
      var it = cart.items[Number(b.dataset.idx)];
      if (!it) return;
      var act = b.dataset.act;
      if (act === 'inc' && it.qty < it.stock) it.qty++;
      if (act === 'dec' && it.qty > 1) it.qty--;
      var key = String(it.id), vr = it.variant || '';
      if (act === 'rm') {
        cart.items.splice(Number(b.dataset.idx), 1);
        if (dbUser) dbWrite(sb.from('customer_cart_items').delete().eq('user_id', dbUser).eq('product_id', key).eq('variant', vr));
      } else if (dbUser) {
        dbWrite(sb.from('customer_cart_items').update({ qty: it.qty }).eq('user_id', dbUser).eq('product_id', key).eq('variant', vr));
      }
      saveCart(); updateCartBadge(); renderCart();
      return;
    }
    var c = e.target.closest('[data-checkout]');
    if (c) location.href = 'checkout.html?shop=' + encodeURIComponent(c.dataset.checkout);
  });
  $('cdBody').addEventListener('change', function (e) {
    var r = e.target;
    if (r.matches('input[data-pick]')) {
      var one = cart.items[Number(r.dataset.pick)];
      if (one) { one.selected = r.checked; setPicked(one); renderCart(); }
      return;
    }
    if (r.matches('input[data-pick-shop]')) {
      cart.items.forEach(function (it) {
        if (String(it.shop_id) === r.dataset.pickShop) { it.selected = r.checked; setPicked(it); }
      });
      renderCart();
      return;
    }
    if (r.matches('input[type="radio"][data-sid]')) {
      cart.options[r.dataset.sid] = r.value;
      saveCart();
      if (dbUser) dbWrite(sb.from('customer_shop_options').upsert({ user_id: dbUser, shop_id: r.dataset.sid, purchase_option: r.value }));
    }
  });
  $('cdFoot').addEventListener('click', function (e) {
    if (e.target.closest('#cdProceed')) location.href = 'checkout.html';
  });
  updateCartBadge();

  function showAvatar(uid, el, savedUrl) {
    var url = savedUrl || (sbOk ? sb.storage.from('shop-banners').getPublicUrl(uid + '/avatar').data.publicUrl : null);
    if (!url) return;
    var img = new Image();
    img.onload = function () { el.style.backgroundImage = 'url("' + url + '")'; el.textContent = ''; };
    img.src = url;
  }

  (async function () {
    if (!sbOk) { await load(); return; }
    var s = (await sb.auth.getSession()).data.session;
    if (!s) { location.replace('auth_customer.html'); return; }
    var prof = await sb.from('profiles').select('role, full_name, avatar_url').eq('id', s.user.id).maybeSingle();
    var role = prof.data && prof.data.role;
    if (role && role !== 'customer') {
      location.replace(role === 'seller' ? 'seller-dashboard.html' : 'admin-dashboard.html');
      return;
    }
    var nm = (prof.data && prof.data.full_name) || s.user.email || 'Q';
    av.textContent = nm.trim().charAt(0).toUpperCase() || 'Q';
    $('meName').textContent = nm;
    showAvatar(s.user.id, av, prof.data && prof.data.avatar_url);
    await loadAccount(s.user.id);
    await load();
  })();
})();