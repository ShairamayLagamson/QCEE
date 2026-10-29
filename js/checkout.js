/* Checkout: reads the cart from customer-home (same storage), asks for delivery or pickup,
   buyer details and remarks, then creates one order per shop in the "orders" and
   "order_items" tables that the seller pages already read. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var sbOk = !!window.sb;
  var CART_KEY = 'qcee_cart';
  var PICKUP_DEFAULT = 'QCU Main Campus - Admin Building';
  var onlyShop = new URLSearchParams(location.search).get('shop');   /* set when checking out one shop */

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var peso = function (n) {
    return '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  var cart = readCart();
  var fulfil = 'pickup';
  var remarks = {};     /* shop id -> remark, kept while the page is open */
  var shopInfo = {};    /* shop id -> { name, location, address, is_open } */
  var user = null;
  var placing = false;
  var schedule = {};    /* shop id -> { date, time } for Pre-Order shops */

  /* Pre-Order dates start tomorrow; time slots are placeholders until shops set their own hours */
  function localDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  var TOMORROW = (function () { var d = new Date(); d.setDate(d.getDate() + 1); return localDate(d); })();
  function slotLabel(h) { return (h % 12 || 12) + ':00 ' + (h < 12 ? 'AM' : 'PM'); }
  var SLOTS = [];
  for (var h = 8; h <= 16; h++) SLOTS.push({ value: String(h).padStart(2, '0') + ':00', label: slotLabel(h) });

  function readCart() {
    try {
      var c = JSON.parse(localStorage.getItem(CART_KEY) || 'null');
      if (c && Array.isArray(c.items)) return { items: c.items, options: c.options || {} };
    } catch (e) {}
    return { items: [], options: {} };
  }
  function writeCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} }

  /* cart items grouped by shop: one group is one order */
  function groups() {
    var map = {}, order = [];
    cart.items.forEach(function (it) {
      var sid = String(it.shop_id);
      if (it.selected === false) return;                       /* not ticked in the cart */
      if (onlyShop && sid !== String(onlyShop)) return;
      if (!map[sid]) { map[sid] = { id: sid, name: it.shop_name || 'Shop', items: [] }; order.push(sid); }
      map[sid].items.push(it);
    });
    return order.map(function (sid) { return map[sid]; });
  }
  function subtotal(g) { return g.items.reduce(function (s, it) { return s + it.price * it.qty; }, 0); }
  function countOf(g) { return g.items.reduce(function (n, it) { return n + it.qty; }, 0); }
  function isClosed(sid) { return !!shopInfo[sid] && shopInfo[sid].is_open === false; }
  function pickupPlace(sid) {
    var s = shopInfo[sid] || {};
    return s.location || s.address || PICKUP_DEFAULT;
  }

  function render() {
    var gs = groups();
    $('coEmpty').hidden = gs.length > 0;
    $('coLayout').hidden = gs.length === 0;
    if (!gs.length) return;
    $('coGroups').innerHTML = gs.map(function (g) {
      var pre = cart.options[g.id] === 'pre';
      var rem = remarks[g.id] || '';
      var n = countOf(g);
      return '<article class="co-shop">' +
        '<header class="co-shop-h"><b>' + esc(g.name) + '</b>' +
        '<span class="co-opt' + (pre ? ' pre' : '') + '">' + (pre ? 'Pre-Order' : 'Order Now') + '</span></header>' +
        (isClosed(g.id) ? '<p class="co-where">This shop is closed right now, so this is a Pre-Order. Choose the date and time below.</p>' : '') +
        g.items.map(function (it) {
          var img = it.image_url ? '<img src="' + esc(it.image_url) + '" alt="">' : '<div class="ch-ph" aria-hidden="true"></div>';
          return '<div class="co-line"><div class="co-img">' + img + '</div>' +
            '<div class="co-li"><b>' + esc(it.name) + '</b>' +
            (it.variant ? '<small>' + esc(it.variant) + '</small>' : '') +
            '<small>' + it.qty + ' × ' + peso(it.price) + '</small></div>' +
            '<span class="co-lt">' + peso(it.price * it.qty) + '</span></div>';
        }).join('') +
        (fulfil === 'pickup' ? '<p class="co-where">Pick up at <b>' + esc(pickupPlace(g.id)) + '</b></p>' : '') +
        (pre ? scheduleBlock(g.id) : '') +
        '<label class="co-field"><span>Remarks <em>optional, the seller will see this</em></span>' +
        '<textarea class="co-remark" data-sid="' + esc(g.id) + '" maxlength="80" rows="2" placeholder="e.g. less sugar, please">' + esc(rem) + '</textarea>' +
        '<small class="co-count">' + rem.length + '/80</small></label>' +
        '<div class="co-subtotal"><span>' + n + ' item' + (n === 1 ? '' : 's') + '</span><b>' + peso(subtotal(g)) + '</b></div>' +
        '</article>';
    }).join('');
    renderSummary();
  }

  function scheduleBlock(sid) {
    var s = schedule[sid] || {};
    return '<div class="co-sched"><span class="co-sched-h">Pre-Order ' + (fulfil === 'delivery' ? 'delivery' : 'pickup') + ' time</span>' +
      '<div class="co-grid2">' +
      '<label class="co-field"><span>Date</span>' +
      '<input type="date" class="co-sched-date" data-sid="' + esc(sid) + '" min="' + TOMORROW + '" value="' + esc(s.date || '') + '"></label>' +
      '<label class="co-field"><span>Time</span>' +
      '<select class="co-sched-time" data-sid="' + esc(sid) + '"><option value="">Choose a time</option>' +
      SLOTS.map(function (t) {
        return '<option value="' + t.value + '"' + (s.time === t.value ? ' selected' : '') + '>' + t.label + '</option>';
      }).join('') +
      '</select></label></div></div>';
  }

  function renderSummary() {
    var gs = groups();
    var total = gs.reduce(function (s, g) { return s + subtotal(g); }, 0);
    $('coSum').innerHTML = gs.map(function (g) {
      return '<div><span>' + esc(g.name) + '</span><b>' + peso(subtotal(g)) + '</b></div>';
    }).join('');
    $('coTotal').textContent = peso(total);
    var blocked = false;
    $('coPlace').disabled = !gs.length || blocked || placing;
  }

  function showErr(msg) {
    $('coErr').textContent = msg || '';
    $('coErr').hidden = !msg;
  }

  function validate() {
    if (!$('coName').value.trim()) return 'Please enter your full name.';
    if (!/^[0-9+()\-\s]{7,}$/.test($('coPhone').value.trim())) return 'Please enter a valid phone number.';
    if (fulfil === 'delivery' && !$('coAddr').value.trim()) return 'Please enter the delivery address.';
    var preErr = '';
    groups().forEach(function (g) {
      if (preErr || cart.options[g.id] !== 'pre') return;
      var s = schedule[g.id] || {};
      if (!s.date || !s.time) preErr = 'Choose the date and time for the Pre-Order from ' + g.name + '.';
      else if (s.date < TOMORROW) preErr = 'Pre-Order dates start from tomorrow (' + g.name + ').';
    });
    if (preErr) return preErr;
    return '';
  }

  /* Order Now has no pickup time; Pre-Order uses the chosen date and time (Philippine time) */
  function row_pickup(sid) {
    if (cart.options[sid] !== 'pre') return null;
    var s = schedule[sid];
    return s.date + 'T' + s.time + ':00+08:00';
  }
  function base_when(sid) {
    if (cart.options[sid] !== 'pre') return 'Order Now';
    var s = schedule[sid], hh = Number(s.time.slice(0, 2));
    return 'Pre-Order · ' + s.date + ' ' + slotLabel(hh);
  }

  /* order numbers look like QC - 0327: four digits, unique across all orders */
  function randomNo() { return String(Math.floor(Math.random() * 10000)).padStart(4, '0'); }

  function orderPayload(g) {
    return {
      shop_id: g.id,
      shop_name: g.name,
      customer_name: $('coName').value.trim(),
      customer_phone: $('coPhone').value.trim(),
      fulfillment: fulfil,
      address: fulfil === 'delivery' ? $('coAddr').value.trim() : pickupPlace(g.id),
      purchase_option: cart.options[g.id] === 'pre' ? 'pre' : 'now',
      remarks: (remarks[g.id] || '').trim().slice(0, 80) || null,
      pickup_time: row_pickup(g.id),
      items: g.items.map(function (it) {
        return { product_id: String(it.id), name: it.name, variant: it.variant || null, qty: it.qty, price: it.price };
      })
    };
  }

  /* every shop goes to the database in one call: all of them are saved, or none */
  async function placeAll(gs) {
    if (!sbOk) {   /* not connected: preview only */
      return { checkout: null, orders: gs.map(function (g) {
        return { no: randomNo(), shop: g.name, total: subtotal(g), when: base_when(g.id) };
      }) };
    }
    var r = await sb.rpc('place_checkout', { p_orders: gs.map(orderPayload) });
    if (r.error) throw new Error(r.error.message || "Couldn't place your order. Please try again.");
    var rows = (r.data && r.data.orders) || [];
    return {
      checkout: (r.data && r.data.checkout_id) || null,
      orders: rows.map(function (o, i) {
        return { no: o.order_no, shop: gs[i].name, total: Number(o.total), when: base_when(gs[i].id) };
      })
    };
  }

  /* the ordered items leave the cart; unticked items stay */
  function clearLocal(gs) {
    var sids = gs.map(function (g) { return g.id; });
    cart.items = cart.items.filter(function (it) {
      return !(sids.indexOf(String(it.shop_id)) > -1 && it.selected !== false);
    });
    sids.forEach(function (sid) {
      if (!cart.items.some(function (it) { return String(it.shop_id) === sid; })) delete cart.options[sid];
    });
    writeCart();
  }

  async function placeOrder() {
    if (placing) return;
    var err = validate();
    showErr(err);
    if (err) return;
    placing = true;
    $('coPlace').textContent = 'Placing order…';
    renderSummary();

    var gs = groups(), result = null, failed = '';
    try {
      result = await placeAll(gs);
    } catch (e) {
      failed = e.message || "Couldn't place your order. Please try again.";
    }
    placing = false;
    $('coPlace').textContent = 'Place Order';
    if (failed) {
      showErr(failed);
      toast(failed);
      render();
      return;
    }
    clearLocal(gs);
    showDone(result);
  }

  function showDone(res) {
    var made = res.orders;
    $('coLayout').hidden = true;
    $('coEmpty').hidden = true;
    $('coDone').hidden = false;
    $('coOrders').innerHTML = made.map(function (o) {
      return '<li><b>QC - ' + esc(o.no) + '</b><span>' + esc(o.shop) + '<small>' + esc(o.when) + '</small></span><em>' + peso(o.total) + '</em></li>';
    }).join('');
    $('coWhere').textContent = (fulfil === 'delivery'
      ? 'It will be delivered to the address you entered.'
      : 'Pick up at the shop location shown on each order.') +
      (res.checkout ? ' These orders were placed together in one checkout.' : '');
    window.scrollTo(0, 0);
  }

  /* a signed-in customer's cart and purchase options come from the database */
  async function loadCartFromAccount(uid) {
    var r1 = await sb.from('customer_cart_items').select('product_id, variant, qty, data').eq('user_id', uid);
    var r2 = await sb.from('customer_shop_options').select('shop_id, purchase_option').eq('user_id', uid);
    if (r1.error || r2.error) return;   /* keep this browser's cart */
    cart = {
      items: (r1.data || []).map(function (r) {
        var d = r.data || {};
        return {
          id: r.product_id, name: d.name, price: Number(d.price) || 0, image_url: d.image_url || null,
          shop_id: String(d.shop_id), shop_name: d.shop_name || 'Shop', variant: r.variant || null,
          qty: r.qty, stock: Number(d.stock) || r.qty, selected: d.selected !== false
        };
      }),
      options: {}
    };
    (r2.data || []).forEach(function (r) { cart.options[String(r.shop_id)] = r.purchase_option; });
    writeCart();
  }

  async function loadShops() {
    var ids = [];
    cart.items.forEach(function (it) {
      var s = String(it.shop_id);
      if (ids.indexOf(s) < 0) ids.push(s);
    });
    if (!ids.length) return;
    var r = await sb.from('businesses').select('id, name, location, address, is_open').in('id', ids);
    if (r.error) r = await sb.from('businesses').select('id, name, is_open').in('id', ids);
    (r.data || []).forEach(function (b) { shopInfo[String(b.id)] = b; });
    // a closed shop can only take a Pre-Order
    Object.keys(shopInfo).forEach(function (sid) {
      if (shopInfo[sid].is_open === false) cart.options[sid] = 'pre';
    });
  }

  async function init() {
    if (sbOk) {
      var s = (await sb.auth.getSession()).data.session;
      if (!s) { location.replace('auth_customer.html'); return; }
      user = s.user;
      var prof = await sb.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle();
      var p = prof.data || {};
      $('coName').value = p.full_name || '';
      $('coPhone').value = p.phone || '';
      $('coEmail').value = user.email || '';
      await loadCartFromAccount(user.id);
      await loadShops();
    }
    render();
  }

  document.querySelectorAll('.co-seg-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      fulfil = b.dataset.f;
      document.querySelectorAll('.co-seg-btn').forEach(function (x) {
        var on = x === b;
        x.classList.toggle('on', on);
        x.setAttribute('aria-checked', String(on));
      });
      $('coDeliv').hidden = fulfil !== 'delivery';
      showErr('');
      render();
    });
  });
  $('coGroups').addEventListener('change', function (e) {
    var t = e.target;
    if (!t.matches('.co-sched-date, .co-sched-time')) return;
    var sid = t.dataset.sid;
    schedule[sid] = schedule[sid] || {};
    if (t.matches('.co-sched-date')) schedule[sid].date = t.value;
    else schedule[sid].time = t.value;
    showErr('');
  });
  $('coGroups').addEventListener('input', function (e) {
    var t = e.target;
    if (!t.matches('.co-remark')) return;
    remarks[t.dataset.sid] = t.value.slice(0, 80);
    t.nextElementSibling.textContent = t.value.length + '/80';
  });
  $('coPlace').addEventListener('click', placeOrder);

  init().catch(function () { render(); });
})();