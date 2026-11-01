/* Purchase History on the customer profile page.
   Shows the "History" tab (#history) in place of the profile form (#profile) and loads the
   signed-in customer's orders from the orders table (with their items and shop name). */
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
  var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  /* e.g. OCT/10/2026 3:24 PM */
  function when(iso) {
    var d = new Date(iso);
    var h = d.getHours();
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return MON[d.getMonth()] + '/' + dd + '/' + d.getFullYear() + ' ' + (h % 12 || 12) + ':' + mm + ' ' + (h < 12 ? 'AM' : 'PM');
  }

  var profileCard = $('cpCard');
  var panel = $('historyPanel');
  var tabProfile = $('tabProfile');
  var tabHistory = $('tabHistory');
  var loaded = false;

  function route() {
    var hist = location.hash === '#history';
    profileCard.hidden = hist;
    panel.hidden = !hist;
    tabProfile.classList.toggle('on', !hist);
    tabHistory.classList.toggle('on', hist);
    if (hist && !loaded) load();
  }

  function itemsCell(items) {
    if (!items.length) return '<span class="ph-muted">No items</span>';
    return items.map(function (it) {
      return '<div class="ph-item">' +
        '<div class="ph-img" aria-hidden="true"></div>' +
        '<div class="ph-item-txt"><b>' + esc(it.name) + '</b>' +
        (it.variant ? '<small>' + esc(it.variant) + '</small>' : '') +
        '<small>Qty: ' + esc(it.qty) + '</small></div></div>';
    }).join('');
  }

  function row(o) {
    var shop = (o.businesses && o.businesses.name) || 'Shop';
    return '<div class="ph-row">' +
      '<div class="ph-cell ph-c-item">' + itemsCell(o.order_items || []) + '</div>' +
      '<div class="ph-cell" data-label="Shop">' + esc(shop) + '</div>' +
      '<div class="ph-cell" data-label="Order #">QC - ' + esc(o.order_no) + '</div>' +
      '<div class="ph-cell" data-label="Amount paid">Subtotal: ' + peso(o.total) + '</div>' +
      '<div class="ph-cell" data-label="Time ordered">' + when(o.created_at) + '</div>' +
      '</div>';
  }

  async function load() {
    var list = $('phList');
    if (!window.sb) { list.innerHTML = '<p class="ph-empty">Not connected.</p>'; return; }
    list.innerHTML = '<p class="ph-empty">Loading…</p>';
    try {
      var s = (await sb.auth.getSession()).data.session;
      if (!s) { list.innerHTML = '<p class="ph-empty">Log in to see your purchases.</p>'; return; }
      var r = await sb.from('orders')
        .select('id, order_no, total, status, created_at, order_items(name, variant, qty, price), businesses(name)')
        .eq('customer_id', s.user.id)
        .eq('status', 'completed')   // only orders the seller has marked completed
        .order('created_at', { ascending: false });
      if (r.error) {
        list.innerHTML = '<p class="ph-empty">Could not load your purchases: ' + esc(r.error.message) + '</p>';
        return;
      }
      loaded = true;
      list.innerHTML = r.data.length
        ? r.data.map(row).join('')
        : '<p class="ph-empty">No completed purchases yet.</p>';
    } catch (e) {
      list.innerHTML = '<p class="ph-empty">Could not load your purchases.</p>';
    }
  }

  window.addEventListener('hashchange', route);
  route();
})();