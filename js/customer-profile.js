/* Customer profile page.
   - Name, Student #, Email and Number are filled from registration (the profile-fields.sql trigger
     copies them from the account into the profiles row the moment someone signs up).
   - Username, Name, Gender, Number and Description can be edited here; each is saved straight to the
     profiles table on blur, so it's the same on any device the customer logs into.
   - the picture is uploaded to the shop-banners bucket under <user id>/avatar and its address is saved
     in profiles.avatar_url, so it also follows the customer to any device.
   - Student # and Email stay fixed: they come from registration and aren't editable here.
   Requires profile-fields.sql to have been run (adds the columns + the policies that allow this). */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var sbOk = !!window.sb;
  var BUCKET = 'shop-banners';
  var user = null;

  /* fields that are saved to the profiles table; student number and e-mail stay as registered */
  var META = { fUsername: 'username', fName: 'full_name', fGender: 'gender', fNumber: 'phone', fDesc: 'description' };
  var FIXED = { fStudent: 'Student number', fEmail: 'E-mail' };

  /* ---------- pencil buttons: unlock a field, lock it again on leaving ---------- */
  document.querySelectorAll('.cp-edit').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = $(btn.getAttribute('data-edit'));
      if (!f) return;
      if (FIXED[f.id]) return note(FIXED[f.id] + " is linked to your registration. Ask the admin if it needs changing.");
      f.removeAttribute('readonly');
      f.focus();
      f.setSelectionRange(f.value.length, f.value.length);
    });
  });

  document.querySelectorAll('.cp-field').forEach(function (f) {
    f.addEventListener('blur', function () {
      f.setAttribute('readonly', '');
      saveField(f);
    });
  });
  $('fGender').addEventListener('change', function () { saveField($('fGender')); });
  async function saveField(f) {
    var col = META[f.id];
    if (!col || !sbOk || !user) return;
    var val = f.value.trim();

    // usernames: letters and numbers only, so every username stays a clean alphanumeric handle
    if (col === 'username') {
      val = val.replace(/[^a-zA-Z0-9]/g, '');
      f.value = val;
      if (!val) return note('Username can only use letters and numbers.');
    }

    var data = {}; data[col] = val;
    note('Saving...');
    var r = await sb.from('profiles').update(data).eq('id', user.id);
    if (r.error) {
      // a unique-username collision comes back as a Postgres duplicate-key error (23505)
      if (col === 'username' && r.error.code === '23505') return note('That username is already taken.');
      return note("Couldn't save: " + r.error.message);
    }
    if (col === 'full_name') { $('cpName').textContent = val || 'Your name'; $('meName').textContent = val; }
    note('Saved.');
  }

  /* ---------- header avatar menu (log out) ---------- */
  var av = $('avatar'), avMenu = $('avMenu');
  av.addEventListener('click', function (e) {
    e.stopPropagation();
    avMenu.hidden = !avMenu.hidden;
    av.setAttribute('aria-expanded', String(!avMenu.hidden));
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.ch-me')) avMenu.hidden = true;
  });
  $('logout').addEventListener('click', async function () {
    if (sbOk) await sb.auth.signOut();
    location.href = 'index.html';
  });

  /* ---------- picture: shown in the big circle and the header avatar ---------- */
  function setPicture(url, initial) {
    var img = $('cpImg'), init = $('cpInitial');
    if (!url) {
      img.style.display = 'none'; init.hidden = false;
      av.style.backgroundImage = ''; av.textContent = initial;
      return;
    }
    img.onload = function () {
      img.style.display = 'block'; init.hidden = true;
      av.style.backgroundImage = 'url("' + url + '")'; av.textContent = '';
    };
    img.onerror = function () { setPicture('', initial); };
    img.src = url;
  }
  function note(msg) { $('cpNote').textContent = msg || ''; }

  function openPicker(e) { e.preventDefault(); $('cpFile').click(); }
  $('cpPhoto').addEventListener('click', openPicker);
  $('cpChange').addEventListener('click', openPicker);

  $('cpFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) return note('Please choose a picture.');
    if (f.size > 12 * 1024 * 1024) return note('Please choose a picture under 12 MB.');
    openCropper(f);
  });

  /* ---------- picture adjuster: drag to move, slider to zoom, inside a square canvas ---------- */
  var cropImg = null;                      // the chosen picture, loaded once
  var cropScale = 1, cropMinScale = 1, cropX = 0, cropY = 0;   // pan/zoom state, canvas-space
  var cropDrag = null;                     // { startX, startY, fromX, fromY } while dragging
  var cropOverlay = $('cropOverlay'), cropStage = $('cropStage'),
      cropCanvas = $('cropCanvas'), cropCtx = cropCanvas.getContext('2d'),
      cropZoom = $('cropZoom');
  var CROP_SIZE = 280;                     // the on-screen canvas is a 280x280 square

  function openCropper(file) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      cropImg = img;
      cropMinScale = Math.max(CROP_SIZE / img.naturalWidth, CROP_SIZE / img.naturalHeight);
      cropScale = cropMinScale;
      cropX = (CROP_SIZE - img.naturalWidth * cropScale) / 2;
      cropY = (CROP_SIZE - img.naturalHeight * cropScale) / 2;
      cropZoom.value = 100;
      drawCrop();
      cropOverlay.hidden = false;
    };
    img.onerror = function () { note("That picture couldn't be opened."); };
    img.src = url;
  }

  function drawCrop() {
    cropCtx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
    cropCtx.drawImage(cropImg, cropX, cropY, cropImg.naturalWidth * cropScale, cropImg.naturalHeight * cropScale);
  }

  function clampCrop() {
    var w = cropImg.naturalWidth * cropScale, h = cropImg.naturalHeight * cropScale;
    cropX = Math.min(0, Math.max(CROP_SIZE - w, cropX));
    cropY = Math.min(0, Math.max(CROP_SIZE - h, cropY));
  }

  cropZoom.addEventListener('input', function () {
    if (!cropImg) return;
    var oldScale = cropScale;
    cropScale = cropMinScale * (cropZoom.value / 100);
    // keep the centre of the ring fixed while zooming
    var cx = CROP_SIZE / 2, cy = CROP_SIZE / 2;
    cropX = cx - (cx - cropX) * (cropScale / oldScale);
    cropY = cy - (cy - cropY) * (cropScale / oldScale);
    clampCrop();
    drawCrop();
  });

  function cropPointerDown(x, y) { cropDrag = { startX: x, startY: y, fromX: cropX, fromY: cropY }; }
  function cropPointerMove(x, y) {
    if (!cropDrag || !cropImg) return;
    cropX = cropDrag.fromX + (x - cropDrag.startX);
    cropY = cropDrag.fromY + (y - cropDrag.startY);
    clampCrop();
    drawCrop();
  }
  function cropPointerUp() { cropDrag = null; }

  cropStage.addEventListener('pointerdown', function (e) {
    cropStage.setPointerCapture(e.pointerId);
    cropPointerDown(e.clientX, e.clientY);
  });
  cropStage.addEventListener('pointermove', function (e) { cropPointerMove(e.clientX, e.clientY); });
  cropStage.addEventListener('pointerup', cropPointerUp);
  cropStage.addEventListener('pointercancel', cropPointerUp);

  function closeCropper() {
    cropOverlay.hidden = true;
    cropImg = null;
    cropDrag = null;
  }
  $('cropCancel').addEventListener('click', closeCropper);

  $('cropSave').addEventListener('click', function () {
    if (!cropImg) return closeCropper();
    // render the same crop at a sharper, fixed output size (not the small on-screen canvas)
    var OUT = 480, ratio = OUT / CROP_SIZE;
    var out = document.createElement('canvas');
    out.width = OUT; out.height = OUT;
    out.getContext('2d').drawImage(
      cropImg,
      cropX * ratio, cropY * ratio,
      cropImg.naturalWidth * cropScale * ratio, cropImg.naturalHeight * cropScale * ratio
    );
    out.toBlob(function (blob) {
      closeCropper();
      if (blob) uploadAvatar(blob);
    }, 'image/jpeg', 0.92);
  });

  async function uploadAvatar(blob) {
    var initial = $('cpInitial').textContent;
    setPicture(URL.createObjectURL(blob), initial);   // show it straight away
    if (!sbOk || !user) return note('Picture shown on this page only.');

    note('Saving picture...');
    var path = user.id + '/avatar';
    var up = await sb.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (up.error) return note("Couldn't save the picture: " + up.error.message);
    var saved = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl + '?v=' + Date.now();

    var r = await sb.from('profiles').update({ avatar_url: saved }).eq('id', user.id);
    if (r.error) return note("Picture uploaded, but couldn't save it to your profile: " + r.error.message);
    setPicture(saved, initial);
    note('Picture saved.');
  }

  /* ---------- fill in the signed-in account ---------- */
  (async function () {
    if (!sbOk) return;
    var s = (await sb.auth.getSession()).data.session;
    if (!s) { location.replace('auth_customer.html'); return; }
    user = s.user;

    var prof = await sb.from('profiles')
      .select('role, full_name, username, gender, phone, student_id, description, avatar_url')
      .eq('id', user.id).maybeSingle();
    var p = prof.data || {};
    var role = p.role;
    if (role && role !== 'customer') {
      location.replace(role === 'seller' ? 'seller-dashboard.html' : 'admin-dashboard.html');
      return;
    }

    // name, student # and phone were copied in from registration by the database trigger
    var nm = p.full_name || user.email || 'Q';
    var initial = nm.trim().charAt(0).toUpperCase() || 'Q';

    $('meName').textContent = nm;
    $('cpName').textContent = nm;
    $('fName').value = p.full_name || '';
    $('fUsername').value = p.username || '';
    $('fGender').value = p.gender || '';
    $('fDesc').value = p.description || '';
    $('fStudent').value = p.student_id || '';
    $('fEmail').value = user.email || '';
    $('fNumber').value = p.phone || '';

    // picture: the one saved on the profile, otherwise whatever's in the bucket, otherwise the initial
    setPicture(p.avatar_url || sb.storage.from(BUCKET).getPublicUrl(user.id + '/avatar').data.publicUrl, initial);
  })();
})();