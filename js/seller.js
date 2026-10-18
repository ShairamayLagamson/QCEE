/* Seller home (shop profile): login guard, floating menu, and the shop's picture / banner / description.
   Everything is locked until the seller presses Edit. */
(function () {
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- floating menu ---------- */
  var btn = $('menuBtn'), chip = $('chipBtn'), menu = $('floatMenu'), back = $('menuBackdrop');
  function setMenu(open) {
    menu.hidden = !open;
    back.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    chip.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  btn.addEventListener('click', function () { setMenu(menu.hidden); });
  chip.addEventListener('click', function () { setMenu(menu.hidden); });
  back.addEventListener('click', function () { setMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  /* ---------- shop profile ---------- */
  var kinds = ['banner', 'logo'];
  var COLUMN = { banner: 'banner_url', logo: 'logo_url' };
  var els = {
    banner: { drop: $('dropBanner'), img: $('bannerPreview'), empty: $('bannerEmpty') },
    logo:   { drop: $('dropLogo'),   img: $('logoPreview'),   empty: $('logoEmpty') },
  };
  var card = $('card'), desc = $('desc'), file = $('file');
  var editBtn = $('editBtn'), removeBtn = $('removeBtn'), saveBtn = $('saveBtn');

  var saved = { banner: null, logo: null };       // what is stored for this shop
  var pending = { banner: null, logo: null };     // newly chosen files, not saved yet
  var removed = { banner: false, logo: false };   // stored image marked for removal
  var preview = { banner: null, logo: null };     // temporary preview URLs of the pending files
  var savedDesc = '';
  var editing = false;
  var selected = 'banner';                        // the picture the Remove button acts on
  var pickKind = 'banner';
  var user = null, shopName = 'My Shop';

  function src(k) { return pending[k] ? preview[k] : (removed[k] ? null : saved[k]); }
  function dirty() {
    return kinds.some(function (k) { return pending[k] || removed[k]; }) || desc.value.trim() !== savedDesc;
  }

  function setName(n) {
    shopName = n || 'My Shop';
    Array.prototype.forEach.call(document.querySelectorAll('.js-shopname'), function (el) { el.textContent = shopName; });
    document.title = shopName + ' | QCee Seller';
  }

  function render() {
    kinds.forEach(function (k) {
      var s = src(k), e = els[k];
      if (s) e.img.src = s;
      e.img.hidden = !s;
      e.empty.hidden = !!s;
      e.drop.classList.toggle('has', !!s);
      e.drop.classList.toggle('sel', editing && selected === k);
      e.drop.setAttribute('aria-disabled', editing ? 'false' : 'true');
      e.drop.parentNode.querySelector('.s-tools').hidden = !(editing && s);
    });
    card.classList.toggle('is-locked', !editing);
    desc.readOnly = !editing;
    editBtn.textContent = editing ? 'Cancel' : 'Edit';
    removeBtn.disabled = !(editing && src(selected));
    saveBtn.disabled = !(editing && dirty());

    // the round picture also shows in the header chip
    var av = $('shopAvatar'), logo = src('logo');
    if (logo) { av.style.backgroundImage = 'url("' + logo + '")'; av.textContent = ''; }
    else { av.style.backgroundImage = ''; av.textContent = shopName.trim().charAt(0).toUpperCase() || 'S'; }
  }

  function startEdit() { editing = true; render(); }
  function cancelEdit() {
    kinds.forEach(function (k) { pending[k] = null; removed[k] = false; });
    desc.value = savedDesc;
    editing = false;
    render();
  }
  editBtn.addEventListener('click', function () { editing ? cancelEdit() : startEdit(); });

  function pick(k) { pickKind = k; selected = k; file.click(); }
  kinds.forEach(function (k) {
    var drop = els[k].drop;
    function onTap() {
      if (!editing) return;                       // locked until Edit is pressed
      if (src(k)) { selected = k; render(); }     // filled: just select it (use Change to replace)
      else pick(k);                               // empty: choose a picture
    }
    drop.addEventListener('click', onTap);
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } });
    drop.parentNode.querySelector('.s-change').addEventListener('click', function () { if (editing) pick(k); });
    drop.parentNode.querySelector('.s-adjust').addEventListener('click', function () { if (editing) adjust(k); });
  });

  file.addEventListener('change', function () {
    var f = file.files[0];
    file.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast('Please choose an image file.'); return; }
    if (f.size > 15 * 1024 * 1024) { toast('Image is too big. Max 15 MB.'); return; }
    openEditor(pickKind, URL.createObjectURL(f), true);    // let the seller fit it before it is used
  });

  function adjust(k) { if (src(k)) openEditor(k, src(k), false); }

  /* ---------- picture editor ----------
     The seller moves / zooms the picture inside a frame that has the final shape (banner 4:3, picture 1:1).
     "Apply" crops exactly what the frame shows, so the saved picture looks the same on every screen. */
  var SHAPE = { banner: { ratio: 4 / 3, w: 1200, h: 900, title: 'Adjust banner' },
                logo:   { ratio: 1,     w: 600,  h: 600, title: 'Adjust profile picture' } };
  var editor = $('editor'), edFrame = $('edFrame'), edCanvas = $('edCanvas'), edZoom = $('edZoom');
  var ed = null;       // { kind, img, url, owned, fw, fh, s, tx, ty, contain, cover, max }
  var ptrs = {};       // active pointers on the frame (drag with one, pinch with two)

  function edDraw() {
    var dpr = window.devicePixelRatio || 1, c = edCanvas.getContext('2d');
    edCanvas.width = Math.round(ed.fw * dpr); edCanvas.height = Math.round(ed.fh * dpr);
    edCanvas.style.width = ed.fw + 'px'; edCanvas.style.height = ed.fh + 'px';
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#fff'; c.fillRect(0, 0, ed.fw, ed.fh);
    c.drawImage(ed.img, ed.tx, ed.ty, ed.img.naturalWidth * ed.s, ed.img.naturalHeight * ed.s);
  }
  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
  function edConstrain() {
    var iw = ed.img.naturalWidth * ed.s, ih = ed.img.naturalHeight * ed.s;
    ed.tx = iw >= ed.fw ? clamp(ed.tx, ed.fw - iw, 0) : clamp(ed.tx, 0, ed.fw - iw);
    ed.ty = ih >= ed.fh ? clamp(ed.ty, ed.fh - ih, 0) : clamp(ed.ty, 0, ed.fh - ih);
  }
  function edSlider() { edZoom.value = Math.round(100 * Math.log(ed.s / ed.contain) / Math.log(ed.max / ed.contain)); }
  function edZoomTo(s, cx, cy) {            // zoom keeping the point (cx, cy) of the frame still
    s = clamp(s, ed.contain, ed.max);
    ed.tx = cx - (cx - ed.tx) * s / ed.s;
    ed.ty = cy - (cy - ed.ty) * s / ed.s;
    ed.s = s; edConstrain(); edSlider(); edDraw();
  }
  function edCenter() {
    ed.tx = (ed.fw - ed.img.naturalWidth * ed.s) / 2;
    ed.ty = (ed.fh - ed.img.naturalHeight * ed.s) / 2;
    edConstrain(); edSlider(); edDraw();
  }

  function openEditor(kind, url, owned) {
    var img = new Image();
    img.crossOrigin = 'anonymous';           // saved pictures come from storage; needed to read them back
    img.onload = function () {
      var shape = SHAPE[kind];
      var fw = Math.min(kind === 'logo' ? 280 : 360, window.innerWidth - 64);
      var fh = Math.round(fw / shape.ratio);
      var cover = Math.max(fw / img.naturalWidth, fh / img.naturalHeight);
      var contain = Math.min(fw / img.naturalWidth, fh / img.naturalHeight);
      ed = { kind: kind, img: img, url: url, owned: owned, fw: fw, fh: fh, contain: contain, cover: cover,
             max: Math.max(cover * 4, contain * 1.5), s: cover, tx: 0, ty: 0 };
      $('edTitle').textContent = shape.title;
      edFrame.style.width = fw + 'px'; edFrame.style.height = fh + 'px';
      edFrame.classList.toggle('round', kind === 'logo');
      edCenter();
      editor.hidden = false;
      document.body.style.overflow = 'hidden';
      $('edApply').focus();
    };
    img.onerror = function () {
      if (owned) URL.revokeObjectURL(url);
      toast("Couldn't open that picture. Try Change and choose it again.");
    };
    img.src = url;
  }
  function closeEditor() {
    if (ed && ed.owned) URL.revokeObjectURL(ed.url);
    ed = null; ptrs = {};
    editor.hidden = true;
    document.body.style.overflow = '';
  }

  edZoom.addEventListener('input', function () {
    var s = ed.contain * Math.pow(ed.max / ed.contain, edZoom.value / 100);
    edZoomTo(s, ed.fw / 2, ed.fh / 2);
  });
  $('edFill').addEventListener('click', function () { ed.s = ed.cover; edCenter(); });
  $('edFit').addEventListener('click', function () { ed.s = ed.contain; edCenter(); });
  edFrame.addEventListener('wheel', function (e) {
    e.preventDefault();
    var r = edFrame.getBoundingClientRect();
    edZoomTo(ed.s * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  function dist() { var p = Object.keys(ptrs).map(function (k) { return ptrs[k]; }); return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
  edFrame.addEventListener('pointerdown', function (e) {
    edFrame.setPointerCapture(e.pointerId);
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
  });
  edFrame.addEventListener('pointermove', function (e) {
    var p = ptrs[e.pointerId]; if (!p || !ed) return;
    var ids = Object.keys(ptrs);
    if (ids.length === 2) {                  // pinch
      var before = dist();
      p.x = e.clientX; p.y = e.clientY;
      var r = edFrame.getBoundingClientRect(), a = ptrs[ids[0]], b = ptrs[ids[1]];
      edZoomTo(ed.s * dist() / before, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    } else {                                 // drag
      ed.tx += e.clientX - p.x; ed.ty += e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      edConstrain(); edDraw();
    }
  });
  function endPtr(e) { delete ptrs[e.pointerId]; }
  edFrame.addEventListener('pointerup', endPtr);
  edFrame.addEventListener('pointercancel', endPtr);

  $('edCancel').addEventListener('click', closeEditor);
  editor.addEventListener('click', function (e) { if (e.target === editor) closeEditor(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !editor.hidden) closeEditor(); });

  $('edApply').addEventListener('click', function () {
    var shape = SHAPE[ed.kind], kind = ed.kind;
    var out = document.createElement('canvas'); out.width = shape.w; out.height = shape.h;
    var c = out.getContext('2d'), f = shape.w / ed.fw;
    c.fillStyle = '#fff'; c.fillRect(0, 0, out.width, out.height);
    c.imageSmoothingQuality = 'high';
    try {
      c.drawImage(ed.img, ed.tx * f, ed.ty * f, ed.img.naturalWidth * ed.s * f, ed.img.naturalHeight * ed.s * f);
      out.toBlob(function (blob) {
        if (!blob) { toast("Couldn't use that picture."); return; }
        if (preview[kind]) URL.revokeObjectURL(preview[kind]);
        pending[kind] = new File([blob], kind + '.jpg', { type: 'image/jpeg' });
        preview[kind] = URL.createObjectURL(pending[kind]);
        removed[kind] = false;
        selected = kind;
        closeEditor();
        render();
      }, 'image/jpeg', 0.9);
    } catch (err) {
      console.warn('crop:', err);
      toast("Couldn't adjust that picture. Try Change and choose it again.");
    }
  });

  desc.addEventListener('input', render);

  removeBtn.addEventListener('click', function () {
    if (!editing) return;
    var k = selected;
    pending[k] = null;
    removed[k] = !!saved[k];                      // an already-saved picture is deleted on Save
    render();
  });

  saveBtn.addEventListener('click', async function () {
    if (!window.sb || !user) { toast('You are not logged in.'); return; }
    saveBtn.classList.add('busy');
    saveBtn.disabled = true;
    try {
      var fields = {}, next = { banner: saved.banner, logo: saved.logo };
      for (var i = 0; i < kinds.length; i++) {
        var k = kinds[i], path = user.id + '/' + k;
        if (pending[k]) {
          var up = await sb.storage.from('shop-banners').upload(path, pending[k], { upsert: true, contentType: pending[k].type });
          if (up.error) throw up.error;
          var url = sb.storage.from('shop-banners').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
          fields[COLUMN[k]] = url; next[k] = url;
        } else if (removed[k] && saved[k]) {
          await sb.storage.from('shop-banners').remove([path]);
          fields[COLUMN[k]] = null; next[k] = null;
        }
      }
      var d = desc.value.trim();
      if (d !== savedDesc) fields.description = d;

      if (Object.keys(fields).length) {
        var upd = await sb.from('businesses').update(fields).eq('owner_id', user.id).select('id');
        if (upd.error) throw upd.error;
        if (!upd.data || !upd.data.length) throw new Error('your shop record was not found');
      }
      saved = next; savedDesc = d; desc.value = d;
      kinds.forEach(function (k) { pending[k] = null; removed[k] = false; });
      editing = false;
      toast('Saved.');
    } catch (err) {
      var m = String((err && err.message) || err);
      console.warn('save:', err);
      toast(/column|schema/i.test(m) ? "Couldn't save yet: run seller-profile.sql in Supabase."
          : /bucket|storage|row-level|not found/i.test(m) ? "Couldn't save: " + m
          : "Couldn't save: " + m);
    } finally {
      saveBtn.classList.remove('busy');
      render();
    }
  });

  /* ---------- login guard + shop info ---------- */
  $('logout').addEventListener('click', async function () {
    if (window.sb) await sb.auth.signOut();
    location.href = 'index.html';
  });

  (async function () {
    if (!window.sb) return;
    var s = (await sb.auth.getSession()).data.session;
    if (!s) { location.replace('auth-s.html'); return; }
    user = s.user;

    var prof = await sb.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
    var role = prof.data && prof.data.role;
    if (role && role !== 'seller') { location.replace(role === 'admin' ? 'admin-dashboard.html' : 'customer-home.html'); return; }

    // the shop's record is created when the admin approves the request (name = the business name from registration)
    var biz = await sb.from('businesses').select('name, banner_url, logo_url, description, is_open').eq('owner_id', user.id).maybeSingle();
    if (biz.error) biz = await sb.from('businesses').select('name, banner_url, is_open').eq('owner_id', user.id).maybeSingle();   // new columns not added yet
    var b = biz.data || {};
    setName(b.name || (prof.data && prof.data.full_name) || 'My Shop');
    if (b.is_open === false) { var st = $('shopStatus'); st.textContent = 'Closed'; st.style.color = '#ff8a7a'; }
    saved.banner = b.banner_url || null;
    saved.logo = b.logo_url || null;
    savedDesc = (b.description || '').trim();
    desc.value = savedDesc;
    render();
  })();

  render();
})();