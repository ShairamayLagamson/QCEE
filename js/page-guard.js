/* Placeholder-page helper: sends logged-out visitors back to the login page and shows who is
   logged in and whether they landed on the page that matches their role. */
(async function () {
  var expected = document.body.dataset.role;          // "customer" or "seller"
  var who = document.getElementById('who');
  var note = document.getElementById('note');

  if (!window.sb) { who.textContent = 'Cannot reach the server.'; return; }

  var res = await sb.auth.getSession();
  var session = res.data.session;
  if (!session) { location.replace('auth_customer.html'); return; }   // not logged in

  var user = session.user;
  // the role comes from the profiles table (users cannot edit it), not from data the browser sends
  var prof = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  var role = (prof.data && prof.data.role) || 'unknown';
  who.textContent = user.email + '  -  role: ' + role;

  if (role === expected) {
    note.textContent = 'You landed on the right page.';
    note.className = 'ok';
  } else {
    note.textContent = 'Wrong page: this one is for ' + expected + 's, but you are a ' + role + '.';
    note.className = 'bad';
  }

  document.getElementById('logout').addEventListener('click', async function () {
    await sb.auth.signOut();
    location.href = 'index.html';
  });
})();