/* Notifications for the customer: the bell on the home page.
   Shows the rows in the "notifications" table for the signed-in customer:
   order status changes, new chat messages from the shop, and simple notices.
   New rows show up right away (realtime), with a 30 second check as a fallback. */
(function () {
  if (!window.sb) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var ICON = { order: 'images/cart-ico.png', message: 'images/msg-ico.png', notice: 'images/bell-ico.png' };

  var btn = $('ntBtn'), panel = $('ntPanel'), list = $('ntList');
  var badge = $('ntBadge'), newLabel = $('ntNew');
  var items = [];

  function ago(iso) {
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return m + ' min' + (m === 1 ? '' : 's') + ' ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' hr' + (h === 1 ? '' : 's') + ' ago';
    var d = Math.round(h / 24);
    return d + ' day' + (d === 1 ? '' : 's') + ' ago';
  }

  function item(n) {
    return '<button type="button" class="nt-item' + (n.read ? '' : ' unread') + '" data-id="' + esc(n.id) +
      '" data-link="' + esc(n.link || '') + '">' +
      '<img src="' + (ICON[n.kind] || ICON.notice) + '" alt="">' +
      '<span class="nt-txt"><b>' + esc(n.title) + '</b>' +
      (n.body ? '<small>' + esc(n.body) + '</small>' : '') +
      '<em>' + esc(ago(n.created_at)) + '</em></span></button>';
  }

  function render() {
    var unread = items.filter(function (x) { return !x.read; }).length;
    badge.hidden = !unread;
    badge.textContent = unread > 9 ? '9+' : String(unread);
    newLabel.textContent = unread ? unread + ' New' : '';
    list.innerHTML = items.length
      ? items.map(item).join('')
      : '<p class="nt-empty">No notifications yet.</p>';
  }

  async function load() {
    try {
      var s = (await sb.auth.getSession()).data.session;
      if (!s) { items = []; render(); return; }
      var r = await sb.from('notifications')
        .select('id, kind, title, body, link, read, created_at')
        .eq('user_id', s.user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (r.error) { console.warn('notifications:', r.error.message); return; }
      items = r.data || [];
      render();
    } catch (e) { /* keep what is shown */ }
  }

  function open(on) {
    panel.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
    if (on) load();
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    open(panel.hidden);
  });
  $('ntClose').addEventListener('click', function () { open(false); });
  document.addEventListener('click', function (e) {
    if (!panel.hidden && !e.target.closest('.nt-wrap')) open(false);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') open(false); });

  list.addEventListener('click', async function (e) {
    var row = e.target.closest('.nt-item');
    if (!row) return;
    var id = row.dataset.id, link = row.dataset.link;
    var n = items.filter(function (x) { return String(x.id) === id; })[0];
    if (n && !n.read) {
      n.read = true;
      render();
      try { await sb.from('notifications').update({ read: true }).eq('id', id); } catch (err) {}
    }
    if (link) location.href = link;
  });

  $('ntMarkAll').addEventListener('click', async function () {
    var s = (await sb.auth.getSession()).data.session;
    if (!s) return;
    items.forEach(function (x) { x.read = true; });
    render();
    try { await sb.from('notifications').update({ read: true }).eq('user_id', s.user.id).eq('read', false); } catch (err) {}
  });

  load();
  setInterval(load, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
  try {
    sb.channel('qcee-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, load)
      .subscribe();
  } catch (e) {}
})();