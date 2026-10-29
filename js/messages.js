/* Messages: chat between a customer and a shop. Shared by messages.html (customer)
   and seller-messages.html (seller). The body's data-role says which side this page is. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var ROLE = document.body.dataset.role;           // "customer" or "seller"
  var sbOk = !!window.sb;
  var me = null;
  var convs = [];          // the conversations this user can see, newest first
  var partners = {};       // customer: keyed by business id; seller: keyed by customer id
  var activeOrder = {};    // seller only: "customer|shop" -> order number of an ongoing order
  var bizIds = [];         // seller only: ids of the shops this seller owns
  var currentId = null;    // the open conversation
  var shownIds = {};       // message ids already in the thread
  var filter = '';
  var narrow = window.matchMedia('(max-width: 700px)');

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var initial = function (s) { return (String(s || '').trim().charAt(0) || '?').toUpperCase(); };
  var unique = function (a) { return a.filter(function (v, i) { return v && a.indexOf(v) === i; }); };

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  function timeText(iso) {
    var d = new Date(iso), now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  // avatars are either a full link or a path in the shop-banners bucket
  function pictureUrl(v) {
    if (!v) return '';
    if (/^https?:/.test(v)) return v;
    try { return sb.storage.from('shop-banners').getPublicUrl(v).data.publicUrl; } catch (e) { return ''; }
  }

  async function clearSession() {
    try { if (sbOk) await sb.auth.signOut({ scope: 'local' }); } catch (e) {}
    try {
      Object.keys(localStorage).forEach(function (k) { if (/^sb-.*-auth-token/.test(k)) localStorage.removeItem(k); });
    } catch (e) {}
  }

  /* ---------- header menus ---------- */
  function setupMenus() {
    var av = $('avatar'), avm = $('avMenu');
    if (av && avm) {
      av.addEventListener('click', function (e) {
        e.stopPropagation();
        avm.hidden = !avm.hidden;
        av.setAttribute('aria-expanded', String(!avm.hidden));
      });
      document.addEventListener('click', function (e) {
        if (!avm.hidden && !avm.contains(e.target)) avm.hidden = true;
      });
    }
    var btn = $('menuBtn'), chip = $('chipBtn'), menu = $('floatMenu'), back = $('menuBackdrop');
    if (btn && menu) {
      var setMenu = function (open) {
        menu.hidden = !open;
        back.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
      };
      btn.addEventListener('click', function () { setMenu(menu.hidden); });
      chip.addEventListener('click', function () { setMenu(menu.hidden); });
      back.addEventListener('click', function () { setMenu(false); });
      menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    }
    var out = $('logout');
    if (out) out.addEventListener('click', async function () {
      await clearSession();
      location.replace('index.html');
    });
  }

  /* ---------- start: login check, then the list ---------- */
  async function start() {
    if (!sbOk) { $('msNone').hidden = false; $('msNone').textContent = 'Cannot reach the server.'; return; }
    var s = (await sb.auth.getSession()).data.session;
    if (!s) { location.replace('auth_customer.html'); return; }
    me = s.user.id;

    var prof = await sb.from('profiles').select('role, full_name, avatar_url').eq('id', me).maybeSingle();
    var role = prof.data && prof.data.role;
    if (role && role !== ROLE) {
      location.replace(role === 'seller' ? 'seller-dashboard.html' : 'customer-home.html');
      return;
    }

    if (ROLE === 'customer') {
      var nm = (prof.data && prof.data.full_name) || s.user.email || 'Q';
      if ($('avatar')) $('avatar').textContent = initial(nm);
      if ($('meName')) $('meName').textContent = nm;

      // opened from a shop's page: make sure the conversation exists, then open it
      var shop = new URLSearchParams(location.search).get('shop');
      if (shop) {
        var ok = await sb.from('businesses').select('id').eq('id', shop).maybeSingle();
        if (ok.data) {
          await sb.from('conversations').upsert(
            { customer_id: me, business_id: String(ok.data.id) },
            { onConflict: 'customer_id,business_id', ignoreDuplicates: true }
          );
        }
      }
      await loadList(shop && ok && ok.data ? String(ok.data.id) : null);
    } else {
      var biz = await sb.from('businesses').select('id, name, logo_url').eq('owner_id', me);
      var shops = biz.data || [];
      bizIds = shops.map(function (b) { return String(b.id); });
      if (shops[0]) {
        var pic = pictureUrl(shops[0].logo_url);
        document.querySelectorAll('.js-shopname').forEach(function (el) { el.textContent = shops[0].name || 'My Shop'; });
        if ($('shopAvatar')) {
          if (pic) $('shopAvatar').innerHTML = '<img src="' + esc(pic) + '" alt="">';
          else $('shopAvatar').textContent = initial(shops[0].name);
        }
      }
      await loadList(null);
    }
    subscribe();
  }

  /* ---------- list ---------- */
  async function loadList(openId) {
    var q = ROLE === 'customer'
      ? sb.from('conversations').select('*').eq('customer_id', me)
      : sb.from('conversations').select('*').in('business_id', bizIds.length ? bizIds : ['none']);
    var r = await q.order('last_at', { ascending: false });
    if (r.error) { toast("Couldn't load messages: " + r.error.message); convs = []; }
    else convs = r.data || [];

    await loadPartners();
    renderList();

    if (openId) {
      var c = convs.find(function (x) { return x.business_id === openId; });
      if (c) openConv(c.id);
    } else if (!narrow.matches && !currentId && convs.length) {
      openConv(convs[0].id);    // on a wide screen, show the newest chat straight away
    }
  }

  async function loadPartners() {
    partners = {};
    activeOrder = {};
    if (ROLE === 'customer') {
      var ids = unique(convs.map(function (c) { return c.business_id; }));
      if (ids.length) {
        var b = await sb.from('businesses').select('id, name, logo_url, banner_url').in('id', ids);
        (b.data || []).forEach(function (x) {
          // same picture the shop cards use: the logo, or the banner when there is no logo
          partners[String(x.id)] = { name: x.name || 'Shop', img: pictureUrl(x.logo_url || x.banner_url) };
        });
      }
    } else {
      var cids = unique(convs.map(function (c) { return c.customer_id; }));
      if (cids.length) {
        // name and picture only, and only for customers who have messaged this seller's shop
        var p = await sb.rpc('qcee_customer_card', { p_ids: cids });
        if (p.error) console.warn('customer names:', p.error.message);
        (p.data || []).forEach(function (x) {
          partners[x.id] = { name: x.full_name || 'Customer', img: pictureUrl(x.avatar_url) };
        });
      }
      // only orders still in progress count as "ongoing" and show their number
      var o = await sb.from('orders').select('order_no, customer_id, shop_id, status, created_at')
        .eq('seller_id', me).in('status', ['pending', 'preparing', 'ready'])
        .order('created_at', { ascending: false });
      (o.data || []).forEach(function (x) {
        var k = x.customer_id + '|' + String(x.shop_id);
        if (!activeOrder[k]) activeOrder[k] = x.order_no;
      });
    }
  }

  function partnerOf(c) {
    var p = ROLE === 'customer' ? partners[String(c.business_id)] : partners[c.customer_id];
    return p || { name: ROLE === 'customer' ? 'Shop' : 'Customer', img: '' };
  }

  function orderOf(c) {
    return ROLE === 'seller' ? activeOrder[c.customer_id + '|' + String(c.business_id)] : null;
  }

  function avatarHtml(p) {
    return p.img
      ? '<span class="ms-av"><img src="' + esc(p.img) + '" alt=""></span>'
      : '<span class="ms-av">' + esc(initial(p.name)) + '</span>';
  }

  // a chat is unread when the latest message came from the other side after this user last read it
  function isUnread(c) {
    if (!c.last_sender_id || c.last_sender_id === me) return false;
    var read = ROLE === 'customer' ? c.customer_read_at : c.shop_read_at;
    return !read || new Date(c.last_at) > new Date(read);
  }

  function rowHtml(c) {
    var p = partnerOf(c), ord = orderOf(c);
    return '<li><button type="button" class="ms-row' + (c.id === currentId ? ' on' : '') + (isUnread(c) ? ' unread' : '') + '" data-id="' + esc(c.id) + '">' +
      avatarHtml(p) +
      '<span class="ms-row-t"><b>' + esc(p.name) + '</b>' +
      (ord ? '<i class="ms-ord">Order: QC-' + esc(ord) + '</i>' : '') +
      '<small>' + esc(c.last_text || 'No messages yet') + '</small></span>' +
      '<time>' + esc(timeText(c.last_at)) + '</time></button></li>';
  }

  function renderList() {
    var list = convs.filter(function (c) {
      if (!filter) return true;
      return (partnerOf(c).name + ' ' + (c.last_text || '')).toLowerCase().indexOf(filter) > -1;
    });
    $('msList').innerHTML = list.map(rowHtml).join('');
    $('msNone').hidden = list.length > 0;
    $('msNone').textContent = convs.length
      ? 'No matches.'
      : (ROLE === 'customer'
          ? 'No messages yet. Open a shop and tap its message button to start a chat.'
          : 'No messages yet. Customers can message your shop from its page.');
  }

  function byLast(a, b) { return new Date(b.last_at) - new Date(a.last_at); }

  // move a conversation to the top of the list with its newest text
  function bump(id, text, at, sender) {
    var c = convs.find(function (x) { return x.id === id; });
    if (!c) return false;
    c.last_text = text;
    c.last_at = at || new Date().toISOString();
    if (sender) c.last_sender_id = sender;
    convs.sort(byLast);
    renderList();
    return true;
  }

  /* ---------- open a conversation ---------- */
  async function openConv(id) {
    currentId = id;
    shownIds = {};
    var c = convs.find(function (x) { return x.id === id; });
    if (!c) return;
    var p = partnerOf(c), ord = orderOf(c);

    $('msEmpty').hidden = true;
    $('msPane').hidden = false;
    $('msWrap').classList.add('show-chat');
    $('msAv').innerHTML = avatarHtml(p);
    $('msName').textContent = p.name;
    $('msSub').hidden = !ord;
    $('msSub').textContent = ord ? 'Order: QC-' + ord : '';
    $('msView').href = ROLE === 'customer' ? 'customer-home.html#orders' : 'seller-orders.html';
    $('msThread').innerHTML = '<p class="ms-hint">Loading messages…</p>';
    renderList();

    var r = await sb.from('messages').select('id, sender_id, body, image_url, created_at')
      .eq('conversation_id', id).order('created_at', { ascending: true }).limit(300);
    if (currentId !== id) return;          // the user already opened another chat
    if (r.error) { $('msThread').innerHTML = '<p class="ms-hint">Could not load messages.</p>'; return; }
    $('msThread').innerHTML = '';
    (r.data || []).forEach(appendMsg);
    if (!(r.data || []).length) $('msThread').innerHTML = '<p class="ms-hint">Say hello!</p>';
    scrollBottom();
    markRead(id);
  }

  // mark the open chat as read for this user, then refresh the list
  async function markRead(id) {
    var c = convs.find(function (x) { return x.id === id; });
    if (!c) return;
    var now = new Date().toISOString();
    if (ROLE === 'customer') c.customer_read_at = now; else c.shop_read_at = now;
    renderList();
    try { await sb.rpc('qcee_mark_read', { p_conv: id }); } catch (e) {}
  }

  function appendMsg(m) {
    if (shownIds[m.id]) return;
    shownIds[m.id] = true;
    if ($('msThread').querySelector('.ms-hint')) $('msThread').innerHTML = '';
    var mine = m.sender_id === me;
    var inner = (m.image_url
        ? '<a href="' + esc(m.image_url) + '" target="_blank" rel="noopener"><img class="ms-photo" src="' + esc(m.image_url) + '" alt="Photo"></a>'
        : '') +
      (m.body ? '<p>' + esc(m.body) + '</p>' : '');
    var row = document.createElement('div');
    row.className = 'ms-msg' + (mine ? ' mine' : '');
    row.innerHTML = '<div class="ms-bubble" title="' + esc(timeText(m.created_at)) + '">' + inner + '</div>';
    $('msThread').appendChild(row);
  }

  function scrollBottom() {
    var t = $('msThread');
    t.scrollTop = t.scrollHeight;
  }

  /* ---------- sending ---------- */
  async function send(fields) {
    var row = Object.assign({ conversation_id: currentId, sender_id: me }, fields);
    var r = await sb.from('messages').insert(row).select('id, sender_id, body, image_url, created_at').single();
    if (r.error) { toast("Couldn't send: " + r.error.message); return false; }
    appendMsg(r.data);
    bump(currentId, fields.body || 'Photo', r.data.created_at, me);
    scrollBottom();
    return true;
  }

  // make a photo small enough to send quickly: longest side up to `max` px, as JPEG
  function shrink(file, max) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('Could not prepare the photo.')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
      img.src = url;
    });
  }

  /* ---------- live updates ---------- */
  function subscribe() {
    try {
      sb.channel('qcee-messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, function (payload) {
          var m = payload.new;
          if (m.conversation_id === currentId) {
            appendMsg(m);
            scrollBottom();
            if (m.sender_id !== me) markRead(currentId);   // it is open, so it counts as read
          }
          var text = m.body || 'Photo';
          if (!bump(m.conversation_id, text, m.created_at, m.sender_id)) loadList(null);   // a brand-new conversation
        })
        .subscribe();
    } catch (e) { /* live updates are a bonus; the page still works without them */ }
  }

  /* ---------- wire up ---------- */
  setupMenus();

  $('msList').addEventListener('click', function (e) {
    var b = e.target.closest('.ms-row');
    if (b) openConv(b.dataset.id);
  });

  $('msSearch').addEventListener('input', function (e) {
    filter = e.target.value.trim().toLowerCase();
    renderList();
  });

  $('msBack').addEventListener('click', function () {
    $('msWrap').classList.remove('show-chat');
    currentId = null;
    renderList();
  });

  $('msForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var input = $('msText');
    var text = input.value.trim();
    if (!text || !currentId) return;
    input.value = '';
    var ok = await send({ body: text });
    if (!ok) input.value = text;
  });

  $('msAttach').addEventListener('click', function () { $('msFile').click(); });

  $('msFile').addEventListener('change', async function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f || !currentId) return;
    if (!/^image\//.test(f.type)) { toast('Please choose an image.'); return; }
    toast('Sending photo…');
    try {
      var blob = await shrink(f, 1280);
      var path = me + '/' + currentId + '/' + Date.now() + '.jpg';
      var up = await sb.storage.from('message-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw up.error;
      var url = sb.storage.from('message-images').getPublicUrl(path).data.publicUrl;
      await send({ image_url: url });
    } catch (err) {
      toast("Couldn't send photo: " + (err.message || err));
    }
  });

  start();
})();