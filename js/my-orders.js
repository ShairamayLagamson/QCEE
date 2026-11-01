/* My Orders on the customer home page (#orders).
   Lists the signed-in customer's current orders (pending, preparing, ready) and refreshes
   every 15 seconds, so the status the seller sets shows up without reloading. Completed
   orders go to the purchase history on the profile page. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var peso = function (n) {
    return '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  var STEPS = ['pending', 'preparing', 'ready'];
  var LABEL = { pending: 'Pending', preparing: 'Preparing', ready: 'Ready' };
  var INFO = {
    pending: { title: 'Waiting for the shop', msg: 'Your order was sent. The shop will confirm it soon.' },
    preparing: { title: 'Being prepared', msg: 'The shop is preparing your order.' },
    ready: { title: 'Ready', msg: 'Your order is ready. Pick it up at the shop.' }
  };

  function ago(iso) {
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return m + ' min' + (m === 1 ? '' : 's') + ' ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' hr' + (h === 1 ? '' : 's') + ' ago';
    var d = Math.round(h / 24);
    return d + ' day' + (d === 1 ? '' : 's') + ' ago';
  }

  function itemsText(items) {
    return (items || []).map(function (i) {
      return i.qty + 'x ' + i.name + (i.variant ? ' (' + i.variant + ')' : '');
    }).join(', ') || '—';
  }

  function card(o) {
    var idx = STEPS.indexOf(o.status);
    var steps = STEPS.map(function (s, i) {
      var cls = i < idx ? 'done' : i === idx ? 'current' : '';
      return '<li class="' + cls + '"><span></span>' + LABEL[s] + '</li>';
    }).join('');
    var shop = (o.businesses && o.businesses.name) || 'Shop';
    return '<article class="mo-card st-' + esc(o.status) + '">' +
      '<div class="mo-main">' +
        '<img class="mo-ico" src="images/cart-ico.png" alt="">' +
        '<div>' +
          '<h3>Order #QC - ' + esc(o.order_no) + ' Status</h3>' +
          '<p class="mo-state">' + esc(INFO[o.status].title) + '</p>' +
          '<p class="mo-msg">' + esc(INFO[o.status].msg) + '</p>' +
          '<small class="mo-time">' + esc(ago(o.created_at)) + '</small>' +
        '</div>' +
      '</div>' +
      '<div class="mo-shop" data-label="Shop">' + esc(shop) + '</div>' +
      '<div class="mo-items" data-label="Items">' + esc(itemsText(o.order_items)) + '</div>' +
      '<div class="mo-amt" data-label="Total">' + peso(o.total) + '</div>' +
      '<ol class="mo-steps" aria-label="Progress">' + steps + '</ol>' +
      '</article>';
  }

  var HEAD = '<div class="mo-head" aria-hidden="true">' +
    '<span>Order</span><span>Shop</span><span>Items</span><span>Total</span><span>Progress</span></div>';

  async function load() {
    var list = $('moList');
    if (!window.sb) { list.innerHTML = '<p class="mo-empty">Not connected.</p>'; return; }
    try {
      var s = (await sb.auth.getSession()).data.session;
      if (!s) { list.innerHTML = '<p class="mo-empty">Log in to see your orders.</p>'; return; }
      var r = await sb.from('orders')
        .select('id, order_no, status, total, created_at, order_items(name, variant, qty), businesses(name)')
        .eq('customer_id', s.user.id)
        .in('status', STEPS)
        .order('created_at', { ascending: false });
      if (r.error) {
        list.innerHTML = '<p class="mo-empty">Could not load your orders: ' + esc(r.error.message) + '</p>';
        return;
      }
      list.innerHTML = r.data && r.data.length
        ? HEAD + r.data.map(card).join('')
        : '<p class="mo-empty">No current orders. Orders you place show up here until they are completed.</p>';
    } catch (e) {
      list.innerHTML = '<p class="mo-empty">Could not load your orders.</p>';
    }
  }

  /* the My Orders drawer, opened from the nav link (or from links to customer-home.html#orders) */
  var overlay = $('moOverlay');
  function openOrders() {
    overlay.hidden = false;
    load();
  }
  function closeOrders() {
    overlay.hidden = true;
  }
  document.querySelectorAll('a[href="#orders"]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); openOrders(); });
  });
  $('moClose').addEventListener('click', closeOrders);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeOrders(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeOrders(); });
  if (location.hash === '#orders') openOrders();

  load();
  setInterval(load, 15000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
})();