/* Seller Order Dashboard: login guard, menu, live order list, status changes. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var user, orders = [], tab = 'ongoing', query = '';
  var STATUSES = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
  var ONGOING = ['pending', 'preparing', 'ready'];

  /* floating menu */
  var btn = $('menuBtn'), chip = $('chipBtn'), menu = $('floatMenu'), back = $('menuBackdrop');
  function setMenu(open) {
    menu.hidden = !open; back.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false'); chip.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  btn.addEventListener('click', function () { setMenu(menu.hidden); });
  chip.addEventListener('click', function () { setMenu(menu.hidden); });
  back.addEventListener('click', function () { setMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  $('logout').addEventListener('click', async function () { if (window.sb) await sb.auth.signOut(); location.href = 'index.html'; });

  var toastTimer;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200); }

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var money = function (n) { return '\u20B1' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
  function timeText(d) {
    d = new Date(d);
    var t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? t : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + t;
  }
  function itemsText(items) { return (Array.isArray(items) ? items : []).map(function (i) { return (i.qty || 1) + 'x ' + i.name; }).join(', '); }
  function count(list) { return orders.filter(function (o) { return list.indexOf(o.status) > -1; }).length; }

  function render() {
    var today = new Date().toDateString();
    var profit = orders.filter(function (o) { return o.status === 'completed' && o.completed_at && new Date(o.completed_at).toDateString() === today; })
      .reduce(function (s, o) { return s + Number(o.total || 0); }, 0);
    function card(lab, ico, n) { return '<div class="o-stat"><div class="top"><span class="lab">' + lab + '</span><span class="ico">' + ico + '</span></div><div class="num">' + n + '</div></div>'; }
    $('stats').innerHTML =
      '<div class="o-stat profit"><div class="top"><span class="lab">Profit today</span><span class="ico">\uD83D\uDCC8</span></div><div class="num">' + money(profit) + '</div><small>From completed orders</small></div>' +
      card('Pending', '\u23F3', count(['pending'])) + card('Preparing', '\uD83E\uDDC1', count(['preparing'])) +
      card('Ready', '\uD83D\uDD14', count(['ready'])) + card('Completed', '\u2705', count(['completed']));
    document.querySelector('[data-n="ongoing"]').textContent = count(ONGOING);
    document.querySelector('[data-n="completed"]').textContent = count(['completed']);
    document.querySelector('[data-n="cancelled"]').textContent = count(['cancelled']);

    var show = tab === 'ongoing' ? ONGOING : [tab], q = query.toLowerCase();
    var list = orders.filter(function (o) {
      return show.indexOf(o.status) > -1 && (!q || (o.customer_name + ' ' + o.order_no + ' ' + itemsText(o.items)).toLowerCase().indexOf(q) > -1);
    });
    $('rows').innerHTML = list.length ? list.map(function (o) {
      var opts = STATUSES.map(function (s) { return '<option value="' + s + '"' + (s === o.status ? ' selected' : '') + '>' + cap(s) + '</option>'; }).join('');
      return '<div class="o-row" data-id="' + o.id + '"><div class="c-name">' + esc(o.customer_name) + '</div>' +
        '<div class="c-order"><b>' + esc(o.order_no) + '</b><small>' + esc(itemsText(o.items)) + '</small></div>' +
        '<div class="c-status"><select class="o-status st-' + o.status + '" aria-label="Order status">' + opts + '</select></div>' +
        '<div class="c-time">' + timeText(o.created_at) + '</div><div class="c-amount">' + money(o.total) + '</div>' +
        '<div class="c-remarks">' + esc(o.remarks || '-') + '</div></div>';
    }).join('') : '<p class="o-empty">' + (q ? 'No orders match your search.' : 'No ' + tab + ' orders yet.') + '</p>';
  }

  async function load() {
    var r = await sb.from('orders').select('*').eq('seller_id', user.id).order('created_at', { ascending: false }).limit(300);
    if (r.error) { toast('Could not load orders: ' + r.error.message); return; }
    orders = r.data || []; render();
  }

  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]'); if (!b) return;
    tab = b.dataset.tab;
    document.querySelectorAll('.o-tab').forEach(function (t) { t.classList.toggle('on', t === b); });
    render();
  });
  $('q').addEventListener('input', function (e) { query = e.target.value.trim(); render(); });

  $('rows').addEventListener('change', async function (e) {
    var sel = e.target.closest('.o-status'); if (!sel) return;
    var id = sel.closest('.o-row').dataset.id, o = orders.filter(function (x) { return x.id === id; })[0];
    var prev = { status: o.status, completed_at: o.completed_at };
    o.status = sel.value; o.completed_at = o.status === 'completed' ? new Date().toISOString() : null;
    render();
    var r = await sb.from('orders').update({ status: o.status, completed_at: o.completed_at }).eq('id', id);
    if (r.error) { o.status = prev.status; o.completed_at = prev.completed_at; render(); toast('Could not update: ' + r.error.message); }
    else toast('Order marked ' + o.status + '.');
  });

  (async function () {
    if (!window.sb) return;
    var s = (await sb.auth.getSession()).data.session;
    if (!s) { location.replace('auth-s.html'); return; }
    user = s.user;
    var prof = await sb.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
    var role = prof.data && prof.data.role;
    if (role && role !== 'seller') { location.replace(role === 'admin' ? 'admin-dashboard.html' : 'customer-home.html'); return; }

    var biz = await sb.from('businesses').select('name, logo_url, is_open').eq('owner_id', user.id).maybeSingle();
    if (biz.error) biz = await sb.from('businesses').select('name, is_open').eq('owner_id', user.id).maybeSingle();
    var b = biz.data || {}, name = b.name || (prof.data && prof.data.full_name) || 'My Shop';
    document.querySelectorAll('.js-shopname').forEach(function (el) { el.textContent = name; });
    document.title = 'Order Dashboard | ' + name;
    var av = $('shopAvatar');
    if (b.logo_url) { av.style.backgroundImage = 'url("' + b.logo_url + '")'; av.textContent = ''; } else av.textContent = name.charAt(0).toUpperCase();
    if (b.is_open === false) { var st = $('shopStatus'); st.textContent = 'Closed'; st.style.color = '#ff8a7a'; }

    await load();
    setInterval(function () { if (!document.hidden) load(); }, 30000);   // new orders appear on their own
  })();
})();