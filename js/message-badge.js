/* Red unread badge on the Messages button. Loaded on the customer home and on the seller pages. */
(function () {
  if (!window.sb) return;

  var style = document.createElement('style');
  style.textContent = '.msg-badge{position:absolute;top:-6px;right:-6px;min-width:24px;height:24px;padding:0 6px;' +
    'border-radius:999px;background:#e5393a;color:#fff;font-size:12px;font-weight:800;line-height:1;' +
    'display:grid;place-items:center;box-shadow:0 0 0 2px #fff;pointer-events:none;}';
  document.head.appendChild(style);

  function target() { return document.getElementById('chat') || document.querySelector('.sm-fab'); }

  async function refresh() {
    var el = target();
    if (!el) return;
    try {
      var s = (await sb.auth.getSession()).data.session;
      if (!s) return;
      var r = await sb.rpc('qcee_unread_count');
      if (r.error) console.warn('unread badge:', r.error.message);
      var n = (!r.error && r.data) || 0;
      var b = el.querySelector('.msg-badge');
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('span'); b.className = 'msg-badge'; el.appendChild(b); }
      b.textContent = n > 9 ? '9+' : String(n);
    } catch (e) { /* no badge if the lookup fails */ }
  }

  refresh();
  // a fallback in case live updates are not switched on for the project: check every 15 seconds
  setInterval(refresh, 15000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  try {
    sb.channel('qcee-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, refresh)
      .subscribe();
  } catch (e) {}
})();