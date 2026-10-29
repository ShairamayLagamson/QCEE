(function () {
  var $ = function (id) { return document.getElementById(id); };
  var user, biz = null, orders = [], query = '';
  var STATUSES = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
  var LABEL = {
    pending: 'Pending', preparing: 'Preparing', ready: 'Ready',
    completed: 'Completed', cancelled: 'Cancelled'
  };
  var ICO = {
    pending: '<img src="images/pending-ico2.png" alt="">',
    preparing: '<img src="images/preparing-ico.png" alt="">',
    ready: '<img src="images/ready-ico.png" alt="">',
    completed: '<img src="images/completed-ico2.png" alt="">',
    cancelled: '<img src="images/aq-cancelled.png" alt="">'
  };

  /* floating menu */
  var btn = $('menuBtn'), chip = $('chipBtn'), menu = $('floatMenu'), back = $('menuBackdrop');
  function setMenu(open) {
    menu.hidden = !open; back.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    chip.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  btn.addEventListener('click', function () { setMenu(menu.hidden); });
  chip.addEventListener('click', function () { setMenu(menu.hidden); });
  back.addEventListener('click', function () { setMenu(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { setMenu(false); closeAllMenus(); }
  });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  $('logout').addEventListener('click', async function () {
    if (window.sb) await sb.auth.signOut();
    location.href = 'index.html';
  });

  var toastTimer;
  function toast(msg) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var money = function (n) {
    return '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  function timeText(d) {
    d = new Date(d);
    var t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString()
      ? t : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + t;
  }
  function itemsText(items) {
    return (Array.isArray(items) ? items : []).map(function (i) {
      return (i.qty || 1) + 'x ' + i.name;
    }).join(', ') || '—';
  }
  function countStatus(s) { return orders.filter(function (o) { return o.status === s; }).length; }
  function closeAllMenus() {
    document.querySelectorAll('.aq-update-menu').forEach(function (m) { m.hidden = true; });
  }

  function renderBreakdown() {
    $('breakdown').innerHTML = STATUSES.map(function (s) {
      return '<div class="aq-pill-s ' + s + '">' +
        '<span class="ico" aria-hidden="true">' + ICO[s] + '</span>' +
        '<span class="meta"><span class="lab">' + LABEL[s] + '</span><span class="n">' + countStatus(s) + '</span></span></div>';
    }).join('');
  }

  function statusBadge(status) {
    return '<span class="aq-badge ' + esc(status) + '">' +
      (status === 'completed' ? '✓ ' : status === 'cancelled' ? '✕ ' : '') +
      LABEL[status] + '</span>';
  }
  function updateDropdown(order) {
    var opts = STATUSES.map(function (s) {
      return '<button type="button" data-status="' + s + '"' + (s === order.status ? ' class="on"' : '') + '>' + LABEL[s] + '</button>';
    }).join('');
    return '<div class="aq-update">' +
      '<button type="button" class="aq-update-btn" data-id="' + esc(order.id) + '">Update</button>' +
      '<div class="aq-update-menu" hidden data-for="' + esc(order.id) + '">' + opts + '</div></div>';
  }
  function delBtn(id) {
    return '<button type="button" class="aq-del" data-del="' + esc(id) + '" aria-label="Delete order">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>';
  }

  function render() {
    renderBreakdown();
    var q = query.toLowerCase();
    var list = orders.filter(function (o) {
      if (!q) return true;
      return (o.customer_name + ' ' + o.order_no + ' ' + itemsText(o.items)).toLowerCase().indexOf(q) > -1;
    });
    $('totalLabel').textContent = 'Showing ' + list.length + ' Total Orders';

    if (!list.length) {
      $('rows').innerHTML = '<p class="aq-empty">' + (q ? 'No orders match your search.' : 'No orders yet. They will appear here when customers place them.') + '</p>';
      return;
    }

    $('rows').innerHTML = list.map(function (o) {
      var items = itemsText(o.items);
      var desktop =
        '<div class="aq-row" data-id="' + esc(o.id) + '">' +
          '<div class="aq-customer">' + esc(o.customer_name) + '</div>' +
          '<div class="aq-order"><b>' + esc(o.order_no) + '</b></div>' +
          '<div class="aq-items">' + esc(items) + '</div>' +
          '<div class="aq-total">' + money(o.total) + '</div>' +
          '<div class="aq-time">' + timeText(o.created_at) + '</div>' +
          '<div>' + statusBadge(o.status) + '</div>' +
          '<div class="aq-actions">' + updateDropdown(o) + delBtn(o.id) + '</div></div>';

      var mobile =
        '<div class="aq-card-mobile" data-id="' + esc(o.id) + '">' +
          '<div class="aq-m-top">' +
            '<div class="aq-m-left">' +
              '<div class="aq-m-name">' + esc(o.customer_name) + '</div>' +
              '<div class="aq-m-items">' + esc(items) + '</div>' +
            '</div>' +
            '<div class="aq-m-right">' +
              '<div class="aq-m-order">' + esc(o.order_no) + '</div>' +
              '<div class="aq-m-time">' + timeText(o.created_at) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="aq-m-bottom">' +
            statusBadge(o.status) +
            updateDropdown(o) +
            '<div class="aq-m-total">' + money(o.total) + '</div>' +
            delBtn(o.id) +
          '</div>' +
        '</div>';

      return desktop + mobile;
    }).join('');
  }

  $('q').addEventListener('input', function (e) { query = e.target.value.trim(); render(); });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.aq-update-btn');
    if (btn) {
      e.stopPropagation();
      var id = btn.dataset.id;
      var m = document.querySelector('.aq-update-menu[data-for="' + id + '"]');
      var wasOpen = m && !m.hidden;
      closeAllMenus();
      if (m && !wasOpen) m.hidden = false;
      return;
    }
    var opt = e.target.closest('.aq-update-menu button[data-status]');
    if (opt) {
      e.stopPropagation();
      changeStatus(opt.closest('.aq-update-menu').dataset.for, opt.dataset.status);
      closeAllMenus();
      return;
    }
    var del = e.target.closest('[data-del]');
    if (del) { e.stopPropagation(); deleteOrder(del.dataset.del); return; }
    if (!e.target.closest('.aq-update')) closeAllMenus();
  });

  async function changeStatus(id, status) {
    var o = orders.filter(function (x) { return x.id === id; })[0];
    if (!o || o.status === status) return;
    var prev = o.status;
    o.status = status;
    if (status === 'completed') o.completed_at = new Date().toISOString();
    render();
    if (!window.sb) { toast('Order marked ' + LABEL[status] + '.'); return; }
    var payload = { status: status };
    if (status === 'completed') payload.completed_at = o.completed_at;
    var r = await sb.from('orders').update(payload).eq('id', id);
    if (r.error) { o.status = prev; render(); toast('Could not update: ' + r.error.message); }
    else toast('Order marked ' + LABEL[status] + '.');
  }

  async function deleteOrder(id) {
    if (!confirm('Delete this order permanently?')) return;
    var idx = orders.findIndex(function (x) { return x.id === id; });
    if (idx < 0) return;
    var removed = orders.splice(idx, 1)[0];
    render();
    if (!window.sb) { toast('Order deleted.'); return; }
    var r = await sb.from('orders').delete().eq('id', id);
    if (r.error) { orders.splice(idx, 0, removed); render(); toast('Could not delete: ' + r.error.message); }
    else toast('Order deleted.');
  }

  async function load() {
    orders = [];
    if (!window.sb || !biz) { render(); return; }

    var r = await sb.from('orders')
      .select('id, order_no, status, total, created_at, completed_at, customer_name, remarks, order_items(name, qty, price)')
      .eq('business_id', biz.id)
      .order('created_at', { ascending: false })
      .limit(500);

    if (r.error) {
      r = await sb.from('orders').select('*').eq('seller_id', user.id).order('created_at', { ascending: false }).limit(500);
    }

    if (!r.error && r.data) {
      orders = r.data.map(function (o) {
        o.items = o.order_items || o.items || [];
        if (o.order_no && String(o.order_no).indexOf('QC') === -1) o.order_no = 'QC - ' + o.order_no;
        return o;
      });
    }
    render();
  }

  (async function () {
    if (!window.sb) { render(); return; }

    var s = (await sb.auth.getSession()).data.session;
    if (!s) { location.replace('auth-s.html'); return; }
    user = s.user;

    var prof = await sb.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
    var role = prof.data && prof.data.role;
    if (role && role !== 'seller') {
      location.replace(role === 'admin' ? 'admin-dashboard.html' : 'customer-home.html');
      return;
    }

    var b = await sb.from('businesses').select('id, name, logo_url, is_open').eq('owner_id', user.id).maybeSingle();
    if (b.error) b = await sb.from('businesses').select('id, name, is_open').eq('owner_id', user.id).maybeSingle();
    biz = b.data || null;
    var name = (biz && biz.name) || (prof.data && prof.data.full_name) || 'My Shop';

    document.querySelectorAll('.js-shopname').forEach(function (el) { el.textContent = name; });
    document.title = 'All Orders Queue | ' + name;

    var av = $('shopAvatar');
    if (biz && biz.logo_url) { av.style.backgroundImage = 'url("' + biz.logo_url + '")'; av.textContent = ''; }
    else av.textContent = name.charAt(0).toUpperCase();
    if (biz && biz.is_open === false) {
      var st = $('shopStatus'); st.textContent = 'Closed'; st.style.color = '#ff8a7a';
    }

    await load();
    setInterval(function () { if (!document.hidden) load(); }, 30000);
  })();
})();