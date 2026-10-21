/* Seller home summary: open / closed switch, today's numbers, what needs attention, shop setup and recent orders.
   Reads businesses, orders (+ order_items) and products. Sample data is shown when Supabase is not reachable. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var LABEL = { pending: 'Pending', preparing: 'Preparing', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled' };
  var sbOk = !!window.sb;
  var biz = null, user = null, demo = false, orders = [], products = [];
  var shown = {};

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var peso = function (n) { return '₱ ' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var whole = function (n) { return Math.round(Number(n || 0)).toLocaleString('en-PH'); };
  var sum = function (list) { return list.reduce(function (s, o) { return s + Number(o.total || 0); }, 0); };
  function time12(t) { if (!t) return ''; var p = String(t).split(':'), h = +p[0]; return (h % 12 || 12) + ':' + (p[1] || '00') + (h >= 12 ? ' PM' : ' AM'); }
  function startOfToday() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function toast(msg) { var t = $('toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 3200); }

  /* ---------- sample data (only when Supabase is not reachable) ---------- */
  function sampleBiz() {
    return { id: 'demo', name: 'My Shop', is_open: true, description: '', logo_url: null, banner_url: null, location: '', day_from: 1, day_to: 5, open_time: '08:00', close_time: '17:00' };
  }
  function sampleOrders() {
    var now = Date.now(), m = 60000;
    return [
      { id: 'a', order_no: 1234, status: 'preparing', customer_name: 'Meowrin', total: 80, created_at: new Date(now - 4 * m).toISOString(), items: [{ name: 'Chockies', qty: 2, price: 40 }] },
      { id: 'b', order_no: 6567, status: 'ready', customer_name: 'Hyei', total: 160, created_at: new Date(now - 35 * m).toISOString(), items: [{ name: 'Go nut or kies me', qty: 4, price: 40 }] },
      { id: 'c', order_no: 1042, status: 'pending', customer_name: 'Ana Reyes', total: 134, created_at: new Date(now - 9 * m).toISOString(), items: [{ name: 'Chockie', qty: 2, price: 67 }] },
      { id: 'd', order_no: 563, status: 'completed', customer_name: 'Jishi', total: 60, created_at: new Date(now - 90 * m).toISOString(), items: [{ name: 'Ube-utiful kies', qty: 2, price: 30 }] },
      { id: 'e', order_no: 1037, status: 'cancelled', customer_name: 'Rico Tan', total: 67, created_at: new Date(now - 130 * m).toISOString(), items: [{ name: 'Chockie', qty: 1, price: 67 }] }
    ];
  }
  function sampleProducts() {
    return [{ id: 'p1', name: 'Chockie', stock: 24 }, { id: 'p2', name: 'Hearkie', stock: 3 }, { id: 'p3', name: 'Pinkie', stock: 0 }, { id: 'p4', name: 'Ube-utiful kies', stock: 0 }];
  }

  /* ---------- numbers ---------- */
  function countUp(el, to, fmt) {
    var from = shown[el.id] || 0, t0 = null; shown[el.id] = to;
    function step(t) {
      if (t0 === null) t0 = t;
      var k = Math.min(1, (t - t0) / 800), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function compute() {
    var today = startOfToday();
    var todays = orders.filter(function (o) { return new Date(o.created_at) >= today; });
    return {
      sales: sum(todays.filter(function (o) { return o.status === 'completed'; })),
      today: todays.filter(function (o) { return o.status !== 'cancelled'; }).length,
      ready: orders.filter(function (o) { return o.status === 'ready'; }).length,
      canc: todays.filter(function (o) { return o.status === 'cancelled'; }).length,
      pending: orders.filter(function (o) { return o.status === 'pending'; }).length,
      soldOut: products.filter(function (p) { return Number(p.stock) <= 0; }),
      low: products.filter(function (p) { return Number(p.stock) > 0 && Number(p.stock) <= 5; })
    };
  }

  /* ---------- status + location ---------- */
  function renderStatus() {
    var open = !biz || biz.is_open !== false, card = document.getElementById('shToggle').closest('.sh-status');
    card.classList.toggle('closed', !open);
    $('shStatusText').textContent = open ? 'Open' : 'Closed';
    $('shStatusHint').textContent = open ? 'Customers can order from you right now.' : 'Customers cannot order until you open the shop.';
    var t = $('shToggle');
    t.dataset.state = open ? 'open' : 'closed';
    t.setAttribute('aria-pressed', open ? 'true' : 'false');
    $('shToggleText').textContent = open ? 'Open' : 'Closed';
    var st = $('shopStatus');
    if (st) { st.textContent = open ? 'Active' : 'Closed'; st.style.color = open ? '' : '#ff8a7a'; }

    $('shWhere').textContent = (biz && biz.location) || 'Not set yet';
    var hours = 'Set your hours in My Store';
    if (biz && biz.open_time && biz.close_time) {
      var days = (biz.day_from != null && biz.day_to != null) ? (biz.day_from === biz.day_to ? DAYS[biz.day_from] : DAYS[biz.day_from] + ' to ' + DAYS[biz.day_to]) : '';
      hours = (days ? days + ' · ' : '') + time12(biz.open_time) + ' to ' + time12(biz.close_time);
    }
    $('shHours').textContent = hours;
  }

  /* ---------- today ---------- */
  function renderKpis(c) {
    countUp($('kSales'), c.sales, peso);
    countUp($('kToday'), c.today, whole);
    countUp($('kReady'), c.ready, whole);
    countUp($('kCanc'), c.canc, whole);
  }

  /* ---------- needs attention ---------- */
  function row(ico, text, sub, go, href) {
    return '<div class="sh-row"><span class="sh-row-ico" aria-hidden="true">' + ico + '</span>' +
      '<div class="sh-row-text">' + text + (sub ? '<small>' + sub + '</small>' : '') + '</div>' +
      (go ? (href ? '<a class="sh-go" href="' + href + '">' + go + '</a>' : '<button type="button" class="sh-go" data-act="open">' + go + '</button>') : '') + '</div>';
  }
  function renderAttention(c) {
    var items = [];
    if (biz && biz.is_open === false) items.push(row('🔒', 'Your shop is closed', 'Customers cannot order right now', 'Open shop', null));
    if (c.pending) items.push(row('⏳', c.pending + ' order' + (c.pending === 1 ? '' : 's') + ' waiting', 'Accept them so customers know they are on the way', 'Review', 'order-dashboard.html'));
    if (c.soldOut.length) items.push(row('🚫', c.soldOut.length + ' product' + (c.soldOut.length === 1 ? '' : 's') + ' sold out', esc(c.soldOut.slice(0, 3).map(function (p) { return p.name; }).join(', ')), 'Restock', 'my-store.html'));
    if (c.low.length) items.push(row('⚠️', c.low.length + ' running low', esc(c.low.slice(0, 3).map(function (p) { return p.name + ' (' + p.stock + ')'; }).join(', ')), 'Check stock', 'my-store.html'));
    $('attCount').textContent = items.length;
    $('attList').innerHTML = items.length ? items.join('') : '<div class="sh-row ok"><span class="sh-row-ico" aria-hidden="true">✨</span><div class="sh-row-text">All clear<small>Nothing needs you right now.</small></div></div>';
  }

  /* ---------- shop setup ---------- */
  var TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
  function renderSetup() {
    var b = biz || {};
    var items = [
      { k: 'Profile picture', ok: !!b.logo_url, href: '#card' },
      { k: 'Shop banner', ok: !!b.banner_url, href: '#card' },
      { k: 'Description', ok: !!String(b.description || '').trim(), href: '#card' },
      { k: 'Pickup location', ok: !!b.location, href: 'my-store.html' },
      { k: 'Opening hours', ok: !!(b.open_time && b.close_time), href: 'my-store.html' },
      { k: 'At least one product', ok: products.length > 0, href: 'my-store.html' }
    ];
    var done = items.filter(function (i) { return i.ok; }).length, pct = Math.round(done / items.length * 100);
    $('setupPct').textContent = pct + '%';
    $('setupBar').style.width = pct + '%';
    $('setupList').innerHTML = items.map(function (i) {
      return '<div class="sh-row' + (i.ok ? ' ok' : '') + '"><span class="sh-tick">' + TICK + '</span>' +
        '<div class="sh-row-text">' + i.k + '</div>' +
        (i.ok ? '' : '<a class="sh-go" href="' + i.href + '">Add</a>') + '</div>';
    }).join('');
  }

  /* ---------- recent orders ---------- */
  function renderRecent() {
    var list = orders.slice(0, 4);
    $('recentList').innerHTML = list.length ? list.map(function (o) {
      var items = (o.items || []).map(function (i) { return (i.qty || 1) + 'x ' + i.name; }).join(', ');
      var when = new Date(o.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return '<div class="sh-row sh-order"><span class="sh-av" aria-hidden="true">' + esc(String(o.customer_name || 'C').charAt(0).toUpperCase()) + '</span>' +
        '<div class="sh-row-text sh-main-row">' + esc(o.customer_name || 'Customer') + '<small>QC - ' + esc(o.order_no) + ' · ' + esc(items) + ' · ' + when + '</small></div>' +
        '<span class="sh-st ' + esc(o.status) + '">' + (LABEL[o.status] || o.status) + '</span>' +
        '<span class="sh-amt">' + peso(o.total) + '</span></div>';
    }).join('') : '<p class="sh-empty">No orders yet. They will show up here.</p>';
  }

  /* ---------- draw ---------- */
  function render() {
    var name = (biz && biz.name) || 'My Shop';
    var h = new Date().getHours();
    $('shGreet').textContent = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    $('shDate').textContent = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) + ' · here is how your shop is doing today';
    $('shDemo').hidden = !demo;
    var c = compute();
    renderStatus(); renderKpis(c); renderAttention(c); renderSetup(); renderRecent();
  }

  /* ---------- open / closed switch ---------- */
  $('shToggle').addEventListener('click', async function () {
    if (!biz) return;
    var next = biz.is_open === false, btn = this;
    btn.disabled = true;
    if (!demo && sbOk) {
      var r = await sb.from('businesses').update({ is_open: next }).eq('id', biz.id).select('id');
      if (r.error || !r.data || !r.data.length) { btn.disabled = false; toast("Couldn't change the shop status."); return; }
    }
    biz.is_open = next;
    btn.disabled = false;
    renderStatus();
    renderAttention(compute());
    toast(next ? 'Your shop is open.' : 'Your shop is closed.');
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-act="open"]')) $('shToggle').click();
  });

  /* ---------- load ---------- */
  async function load() {
    if (!sbOk) { demo = true; biz = sampleBiz(); orders = sampleOrders(); products = sampleProducts(); render(); return; }
    if (!biz) { orders = []; products = []; render(); return; }
    var since = new Date(Date.now() - 30 * 864e5).toISOString();
    var r = await sb.from('orders').select('id, order_no, status, total, created_at, customer_name, order_items(name, qty, price)')
      .eq('business_id', biz.id).gte('created_at', since).order('created_at', { ascending: false }).limit(500);
    var p = await sb.from('products').select('id, name, stock').eq('business_id', biz.id);
    if (r.error || p.error) {
      console.warn('home:', r.error || p.error);
      demo = true; orders = sampleOrders(); products = sampleProducts();
      toast("Couldn't load your summary yet: run orders.sql and my-store.sql in Supabase.");
    } else {
      demo = false;
      orders = (r.data || []).map(function (o) { o.items = o.order_items || []; return o; });
      products = p.data || [];
    }
    render();
  }

  /* reveal panels as they scroll into view */
  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.12 }) : null;
  document.querySelectorAll('.sh-reveal').forEach(function (el) { if (io) io.observe(el); else el.classList.add('in'); });

  (async function () {
    if (!sbOk) { await load(); return; }
    var s = (await sb.auth.getSession()).data.session;
    if (!s) return;                               // seller.js sends logged-out visitors to the login page
    user = s.user;
    var b = await sb.from('businesses').select('id, name, banner_url, logo_url, description, is_open, location, day_from, day_to, open_time, close_time').eq('owner_id', user.id).maybeSingle();
    if (b.error) b = await sb.from('businesses').select('id, name, banner_url, logo_url, description, is_open').eq('owner_id', user.id).maybeSingle();
    biz = b.data || null;
    await load();
    setInterval(function () { if (!document.hidden && !demo) load(); }, 60000);
  })();
})();