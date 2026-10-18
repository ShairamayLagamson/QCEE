(() => {
  // where each choice goes (buyer/seller open on the Login or Register side; admin is login only)
  const PAGES = { buyer: 'auth_customer.html', seller: 'auth-s.html', admin: 'auth-admin.html' };

  // build the popup (so index.html needs no extra markup)
  const overlay = document.createElement('div');
  overlay.className = 'role-overlay';
  overlay.innerHTML = `
    <div class="role-card" role="dialog" aria-modal="true" aria-labelledby="roleTitle">
      <button class="role-close" aria-label="Close">×</button>
      <img class="role-logo" src="images/logo2.png" alt="" onerror="this.style.display='none'">
      <h2 class="role-title" id="roleTitle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>
        </svg>
        Please select your user type
      </h2>
      <div class="role-actions">
        <button class="role-btn" data-role="buyer">Buyer</button>
        <button class="role-btn" data-role="seller">Seller</button>
        <button class="role-btn" data-role="admin" id="roleAdmin">Admin</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const adminBtn = overlay.querySelector('#roleAdmin');

  let mode = 'login', lastFocus = null;

  function open(m) {
    mode = m;
    adminBtn.hidden = m === 'register';                     // there is only one admin: no registering
    lastFocus = document.activeElement;
    const gate = document.getElementById('overlay');        // close the "login to continue" popup if open
    if (gate) gate.classList.remove('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    overlay.querySelector('.role-btn').focus();
  }
  function close() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  // any link with data-pick="login|register" (or to login.html / register.html) opens the picker
  document.addEventListener('click', e => {
    const link = e.target.closest('a[href], [data-pick]');
    if (!link || overlay.contains(link)) return;
    const pick = link.dataset.pick || (link.getAttribute('href') || '').match(/(?:^|\/)(login|register)\.html/)?.[1];
    if (pick) { e.preventDefault(); open(pick); }
  });

  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.closest('.role-close')) return close();
    const btn = e.target.closest('[data-role]');
    if (!btn) return;
    const role = btn.dataset.role;
    location.href = role === 'admin' ? PAGES.admin : `${PAGES[role]}?mode=${mode}`;
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
})();