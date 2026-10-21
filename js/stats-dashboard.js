/* Stats Dashboard: money and orders for the chosen period, the sales line, top products,
   busiest hours, cancellation rate and sold-out alerts.
   Reads "orders" + "order_items" (orders.sql) and "products" (my-store.sql). Sample data is shown until they exist. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var PERIOD_TEXT = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
  var sbOk = !!window.sb;
  var orders = [], products = [], demo = false, biz = null, user = null;
  var period = 'monthly', picked = null;
  var shown = {};          // last numbers shown, so they count up from there

  /* ---------- floating menu ---------- */
  var btn = $('menuBtn'), chip = $('chipBtn'), menu = $('floatMenu'), back = $('menuBackdrop');
  function setMenu(open) {
    menu.hidden = !open; back.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false'); chip.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  btn.addEventListener('click', function () { setMenu(menu.hidden); });
  chip.addEventListener('click', function () { setMenu(menu.hidden); });
  back.addEventListener('click', function () { setMenu(false); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  $('logout').addEventListener('click', async function () { if (window.sb) await sb.auth.signOut(); location.href = 'index.html'; });

  var toastTimer;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200); }

  /* ---------- helpers ---------- */
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var peso = function (n) { return '₱ ' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var whole = function (n) { return Math.round(Number(n || 0)).toLocaleString('en-PH'); };
  function hLabel(h) { return (h % 12 || 12) + (h < 12 ? ' AM' : ' PM'); }
  function hShort(h) { return (h % 12 || 12) + (h < 12 ? 'a' : 'p'); }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
  function dayText(d) { return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function fmtDate(d) { return DAYS[d.getDay()].slice(0, 3) + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }

  /* the time window for the chosen period */
  function windowFor() {
    var today = startOfDay(new Date());
    if (period === 'date' && picked) {
      var s = startOfDay(picked);
      return { start: s, end: addDays(s, 1), kind: 'hour', sub: 'Revenue per hour on ' + fmtDate(s) };
    }
    if (period === 'daily') return { start: today, end: addDays(today, 1), kind: 'hour', sub: 'Revenue per hour today' };
    if (period === 'weekly') return { start: addDays(today, -6), end: addDays(today, 1), kind: 'day', sub: 'Daily revenue, last 7 days' };
    if (period === 'yearly') {
      var firstThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: addMonths(firstThisMonth, -11), end: addMonths(firstThisMonth, 1), kind: 'month', sub: 'Monthly revenue, last 12 months' };
    }
    return { start: addDays(today, -29), end: addDays(today, 1), kind: 'day', sub: 'Daily revenue, last 30 days' };
  }

  /* one bucket per point on the line */
  function makeBuckets(w) {
    var list = [], i;
    if (w.kind === 'hour') {
      for (i = 0; i < 24; i++) list.push({ label: hShort(i), name: hLabel(i), sales: 0, count: 0 });
    } else if (w.kind === 'day') {
      var n = Math.round((w.end - w.start) / 864e5);
      for (i = 0; i < n; i++) {
        var d = addDays(w.start, i);
        list.push({ label: n <= 7 ? DAYS[d.getDay()].slice(0, 3) : d.getDate() + ' ' + MONTHS[d.getMonth()], name: dayText(d), sales: 0, count: 0 });
      }
    } else {
      for (i = 0; i < 12; i++) {
        var m = addMonths(w.start, i);
        list.push({ label: MONTHS[m.getMonth()], name: MONTHS[m.getMonth()] + ' ' + m.getFullYear(), sales: 0, count: 0 });
      }
    }
    return list;
  }
  function bucketFor(w, list, d) {
    if (w.kind === 'hour') return list[d.getHours()];
    if (w.kind === 'day') return list[Math.round((startOfDay(d) - w.start) / 864e5)];
    return list[(d.getFullYear() - w.start.getFullYear()) * 12 + d.getMonth() - w.start.getMonth()];
  }

  /* everything the page shows, worked out from the orders in the window */
  function compute() {
    var w = windowFor(), list = makeBuckets(w), i;
    var inRange = orders.filter(function (o) { var d = new Date(o.created_at); return d >= w.start && d < w.end; });
    var done = inRange.filter(function (o) { return o.status === 'completed'; });
    var canc = inRange.filter(function (o) { return o.status === 'cancelled'; });
    var money = 0, byName = {}, hours = [];
    for (i = 0; i < 24; i++) hours.push(0);

    done.forEach(function (o) {
      var t = Number(o.total || 0), b = bucketFor(w, list, new Date(o.created_at));
      money += t;
      if (b) { b.sales += t; b.count++; }
      (o.items || []).forEach(function (it) {
        var k = it.name || 'Item', q = Number(it.qty || 1);
        byName[k] = byName[k] || { name: k, qty: 0, rev: 0 };
        byName[k].qty += q;
        byName[k].rev += q * Number(it.price || 0);
      });
    });
    inRange.forEach(function (o) { if (o.status !== 'cancelled') hours[new Date(o.created_at).getHours()]++; });

    var tops = Object.keys(byName).map(function (k) { return byName[k]; })
      .sort(function (a, b) { return b.qty - a.qty || b.rev - a.rev; });
    return { w: w, list: list, total: inRange.length, done: done.length, canc: canc.length, money: money, tops: tops, hours: hours };
  }

  /* numbers count up to their new value */
  function countUp(el, to, fmt) {
    var from = shown[el.id] || 0, t0 = null;
    shown[el.id] = to;
    function step(t) {
      if (t0 === null) t0 = t;
      var k = Math.min(1, (t - t0) / 800), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- sales line ---------- */
  var PAD = { l: 60, r: 18, t: 22, b: 36 };
  function niceTop(max) {
    var raw = Math.max(max * 1.15, 400), unit = Math.pow(10, Math.floor(Math.log10(raw / 4))), f = raw / 4 / unit;
    var s = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return unit * s * 4;
  }
  function axisText(v) { return '₱' + Math.round(v).toLocaleString('en-PH'); }
  /* smooth curve through the points (Catmull-Rom), kept inside the chart */
  function smoothPath(p, top, bottom) {
    if (p.length < 2) return p.length ? 'M' + p[0][0] + ',' + p[0][1] : '';
    var d = 'M' + p[0][0] + ',' + p[0][1], cl = function (y) { return Math.min(bottom, Math.max(top, y)); };
    for (var i = 0; i < p.length - 1; i++) {
      var p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = cl(p1[1] + (p2[1] - p0[1]) / 6);
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = cl(p2[1] - (p3[1] - p1[1]) / 6);
      d += ' C' + c1x + ',' + c1y + ' ' + c2x + ',' + c2y + ' ' + p2[0] + ',' + p2[1];
    }
    return d;
  }
  function renderLine(c) {
    var wrap = $('lineWrap'), W = Math.max(280, wrap.clientWidth || 720), H = Math.min(300, Math.round(W * 0.42));
    var list = c.list, n = list.length, top = niceTop(Math.max.apply(null, list.map(function (b) { return b.sales; }).concat([0])));
    var x = function (i) { return n === 1 ? (W + PAD.l - PAD.r) / 2 : PAD.l + i * (W - PAD.l - PAD.r) / (n - 1); };
    var y = function (v) { return PAD.t + (H - PAD.t - PAD.b) * (1 - v / top); };
    var pts = list.map(function (b, i) { return [x(i), y(b.sales)]; });

    var grid = '';
    for (var k = 0; k <= 4; k++) {
      var val = top * k / 4, yy = y(val);
      grid += '<line class="st-grid" x1="' + PAD.l + '" x2="' + (W - PAD.r) + '" y1="' + yy + '" y2="' + yy + '"/>' +
              '<text class="st-axis" x="' + (PAD.l - 10) + '" y="' + (yy + 4) + '" text-anchor="end">' + axisText(val) + '</text>';
    }
    var maxLabels = Math.max(2, Math.floor((W - PAD.l - PAD.r) / 72)), step = Math.max(1, Math.ceil(n / maxLabels)), labels = '';
    list.forEach(function (b, i) {
      if (i % step === 0) labels += '<text class="st-axis" x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(b.label) + '</text>';
    });
    var d = smoothPath(pts, PAD.t, H - PAD.b);
    var area = d + ' L' + x(n - 1) + ',' + (H - PAD.b) + ' L' + x(0) + ',' + (H - PAD.b) + ' Z';
    var dots = pts.map(function (p, i) {
      return '<g class="st-pt" data-i="' + i + '"><circle class="st-dot" cx="' + p[0] + '" cy="' + p[1] + '" r="5"/>' +
             '<circle class="st-hit" cx="' + p[0] + '" cy="' + p[1] + '" r="16"/></g>';
    }).join('');

    var svg = $('line');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.style.height = H + 'px';
    svg.innerHTML =
      '<defs><linearGradient id="stArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ECA54B" stop-opacity=".5"/><stop offset="1" stop-color="#ECA54B" stop-opacity="0"/></linearGradient></defs>' +
      grid + '<path class="st-area" d="' + area + '" fill="url(#stArea)"/>' +
      '<path id="linePath" class="st-line" d="' + d + '"/>' + labels + dots;

    // draw the line from left to right
    var path = $('linePath'), len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    path.getBoundingClientRect();
    path.style.strokeDashoffset = 0;

    // hover / tap tooltip on each point
    var tip = $('lineTip');
    Array.prototype.forEach.call(svg.querySelectorAll('.st-pt'), function (g) {
      var i = Number(g.dataset.i), b = list[i];
      var show = function () {
        tip.innerHTML = '<b>' + esc(b.name) + '</b>Sales ' + peso(b.sales) + ' &middot; ' + b.count + ' order' + (b.count === 1 ? '' : 's');
        tip.style.left = pts[i][0] + 'px';
        tip.style.top = pts[i][1] + 'px';
        tip.hidden = false;
        g.classList.add('on');
      };
      var hide = function () { tip.hidden = true; g.classList.remove('on'); };
      g.addEventListener('pointerenter', show);
      g.addEventListener('pointerleave', hide);
    });
    tip.hidden = true;
  }

  /* ---------- top products ---------- */
  function renderTop(c) {
    var el = $('topList');
    if (!c.tops.length) { el.innerHTML = '<p class="st-empty">No completed sales in this period yet.</p>'; return; }
    var max = c.tops[0].qty || 1;
    el.innerHTML = c.tops.slice(0, 5).map(function (t, i) {
      return '<div class="st-bar">' +
        '<div class="st-bar-top"><span class="st-bar-name">' + esc(t.name) + '</span><span class="st-bar-val">' + t.qty + ' sold &middot; ' + esc(peso(t.rev)) + '</span></div>' +
        '<div class="st-track"><i style="--w:' + Math.max(6, t.qty / max * 100) + '%;--i:' + i + '"></i></div>' +
        '</div>';
    }).join('');
  }

  /* ---------- busiest hours (7 AM to 9 PM) ---------- */
  function renderHours(c) {
    var hrs = [], h;
    for (h = 7; h <= 21; h++) hrs.push(h);
    var max = Math.max.apply(null, hrs.map(function (x) { return c.hours[x]; }).concat([1]));
    var peak = hrs.reduce(function (a, x) { return c.hours[x] > c.hours[a] ? x : a; }, hrs[0]);
    $('hours').innerHTML = hrs.map(function (x, i) {
      var v = c.hours[x], pct = v ? Math.max(6, v / max * 100) : 0;
      return '<div class="st-col' + (x === peak && v ? ' peak' : '') + '">' +
        '<div class="st-bar-area" style="--h:' + pct + '%"><i style="--i:' + i + '"></i>' +
        '<span class="st-tip-col">' + hLabel(x) + ' &middot; ' + v + ' order' + (v === 1 ? '' : 's') + '</span></div>' +
        '<b>' + hShort(x) + '</b></div>';
    }).join('');
    $('peakText').textContent = c.hours[peak] ? 'Busiest: ' + hLabel(peak) + ' (' + c.hours[peak] + ' orders)' : 'No orders in this period yet.';
  }

  /* ---------- cancellation rate ---------- */
  function renderCancel(c) {
    var pct = c.total ? Math.round(c.canc / c.total * 100) : 0, C = 2 * Math.PI * 60;
    var arc = $('donutArc');
    arc.style.strokeDasharray = C;
    arc.style.strokeDashoffset = C;
    arc.getBoundingClientRect();
    arc.style.strokeDashoffset = C * (1 - pct / 100);
    $('donutPct').textContent = pct + '%';
    $('cancelText').textContent = c.canc + ' of ' + c.total + ' orders cancelled in this period';
    $('legDone').textContent = c.done + ' completed';
    $('legCanc').textContent = c.canc + ' cancelled';
  }

  /* ---------- sold-out alerts ---------- */
  function renderAlerts() {
    var list = products.filter(function (p) { return Number(p.stock) <= 5; })
      .sort(function (a, b) { return Number(a.stock) - Number(b.stock); }).slice(0, 8);
    $('alertCount').textContent = list.length;
    $('alerts').innerHTML = list.length ? list.map(function (p) {
      var out = Number(p.stock) <= 0;
      return '<div class="st-alert' + (out ? ' out' : '') + '"><span class="st-alert-dot"></span>' +
        '<span class="st-alert-name">' + esc(p.name) + '</span>' +
        '<span class="st-pill-s ' + (out ? 'is-out' : 'is-low') + '">' + (out ? 'Sold out' : 'Only ' + Number(p.stock) + ' left') + '</span></div>';
    }).join('') : '<p class="st-empty">All products are well stocked.</p>';
  }

  /* ---------- draw everything ---------- */
  function render() {
    var c = compute();
    countUp($('kMoney'), c.money, peso);
    countUp($('kOrders'), c.done, whole);
    $('analyticsSub').textContent = c.w.sub;

    var best = null;
    c.list.forEach(function (b) { if (!best || b.sales > best.sales) best = b; });
    var kind = c.w.kind === 'hour' ? 'Hour' : c.w.kind === 'day' ? 'Day' : 'Month';
    $('highPill').textContent = best && best.sales > 0
      ? 'Highest Sales ' + kind + ': ' + best.name + ' (' + peso(best.sales) + ')'
      : 'Highest Sales ' + kind + ': none yet';

    $('periodLabel').textContent = period === 'date' && picked ? fmtDate(picked) : PERIOD_TEXT[period];
    renderLine(c);
    renderTop(c);
    renderHours(c);
    renderCancel(c);
    renderAlerts();
    $('demoNote').hidden = !demo;
  }

  /* ---------- period picker ---------- */
  var pBtn = $('periodBtn'), pMenu = $('periodMenu'), pDate = $('pickDate');
  function setPeriodMenu(open) { pMenu.hidden = !open; pBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  function markActive() {
    Array.prototype.forEach.call(pMenu.querySelectorAll('[data-period]'), function (b) {
      b.classList.toggle('on', period === b.dataset.period);
    });
  }
  pBtn.addEventListener('click', function (e) { e.stopPropagation(); setPeriodMenu(pMenu.hidden); });
  pMenu.addEventListener('click', function (e) {
    var b = e.target.closest('[data-period]');
    if (!b) return;
    period = b.dataset.period; picked = null;
    setPeriodMenu(false); markActive(); render();
  });
  pDate.addEventListener('change', function () {
    if (!pDate.value) return;
    var p = pDate.value.split('-');
    picked = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    period = 'date';
    setPeriodMenu(false); markActive(); render();
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('#period')) setPeriodMenu(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { setPeriodMenu(false); setMenu(false); }
  });
  var todayIso = (function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
  pDate.max = todayIso;
  markActive();

  var resizeTimer;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); });

  /* ---------- sample data (until the tables exist) ---------- */
  function sample() {
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var names = [['Chockie', 67], ['Hearkie', 50], ['Pinkie', 70], ['Ube-utiful kies', 30], ['Go nut or kies me', 40], ['Chockies', 40]];
    var now = new Date(), out = [];
    for (var i = 0; i < 300; i++) {
      var daysAgo = Math.floor(Math.pow(rnd(), 1.5) * 380);
      var h = 8 + Math.floor(rnd() * 13);
      if (rnd() < 0.35) h = rnd() < 0.5 ? 12 : 13;
      var d = addDays(startOfDay(now), -daysAgo);
      d.setHours(h, Math.floor(rnd() * 60), 0, 0);
      if (d > now) d = new Date(now.getTime() - rnd() * 3 * 3600e3);
      var items = [], k = 1 + Math.floor(rnd() * 2), total = 0;
      for (var j = 0; j < k; j++) {
        var p = names[Math.floor(rnd() * names.length)], q = 1 + Math.floor(rnd() * 3);
        items.push({ name: p[0], qty: q, price: p[1] });
        total += p[1] * q;
      }
      out.push({ id: 's' + i, order_no: 1000 + i, status: rnd() < 0.1 ? 'cancelled' : 'completed', total: total, created_at: d.toISOString(), items: items });
    }
    return out;
  }
  function sampleProducts() {
    return [
      { id: 'p1', name: 'Chockie', stock: 24 }, { id: 'p2', name: 'Hearkie', stock: 3 },
      { id: 'p3', name: 'Pinkie', stock: 0 }, { id: 'p4', name: 'Ube-utiful kies', stock: 0 },
      { id: 'p5', name: 'Go nut or kies me', stock: 4 }, { id: 'p6', name: 'Chockies', stock: 18 }
    ];
  }

  /* ---------- load ---------- */
  async function load() {
    if (!sbOk || !biz) { demo = true; orders = sample(); products = sampleProducts(); render(); return; }
    var since = addDays(startOfDay(new Date()), -400).toISOString();
    var r = await sb.from('orders').select('id, order_no, status, total, created_at, order_items(name, qty, price)')
      .eq('business_id', biz.id).gte('created_at', since).order('created_at', { ascending: false }).limit(5000);
    var p = await sb.from('products').select('id, name, stock').eq('business_id', biz.id);
    if (r.error || p.error) {
      console.warn('stats:', r.error || p.error);
      demo = true; orders = sample(); products = sampleProducts();
      toast("Couldn't load your stats yet: run orders.sql and my-store.sql in Supabase.");
    } else {
      demo = false;
      orders = (r.data || []).map(function (o) { o.items = o.order_items || []; return o; });
      products = p.data || [];
    }
    render();
  }

  /* ---------- login guard ---------- */
  (async function () {
    if (!sbOk) { await load(); return; }
    var s = (await sb.auth.getSession()).data.session;
    if (!s) { location.replace('auth-s.html'); return; }
    user = s.user;
    var prof = await sb.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
    var role = prof.data && prof.data.role;
    if (role && role !== 'seller') { location.replace(role === 'admin' ? 'admin-dashboard.html' : 'customer-home.html'); return; }

    var b = await sb.from('businesses').select('id, name, is_open').eq('owner_id', user.id).maybeSingle();
    biz = b.data || null;
    var name = (biz && biz.name) || (prof.data && prof.data.full_name) || 'My Shop';
    document.querySelectorAll('.js-shopname').forEach(function (el) { el.textContent = name; });
    document.title = 'Stats Dashboard | ' + name;
    $('shopAvatar').textContent = name.trim().charAt(0).toUpperCase() || 'S';
    if (biz && biz.is_open === false) { var st = $('shopStatus'); st.textContent = 'Closed'; st.style.color = '#ff8a7a'; }

    await load();
    setInterval(function () { if (!document.hidden && !demo) load(); }, 60000);
  })();
})();